import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLanguageDefinition, normalizeLanguageCode } from '../../i18n/languages.js'
import { confirmAiAction, requestAiHelpReply } from './aiHelpClient.js'
import { officialSumUpHostedCheckoutUrl } from './hostedCheckoutUrl.js'
import { reportClientBug } from '../../services/bugMonitor/bugMonitorClient.js'
import { requestOpenHelpSection } from './aiHelpTools.js'
import { isDirectNavigationRequest } from './navigationRequest.js'
import SupportPanel from './SupportPanel.jsx'
import { helpChrome } from './uiChrome.js'
import { requestedLanguageSwitch } from './launchGuidance.js'
import { changeAppLanguage } from '../../i18n/index.js'
import './AiHelpPanel.css'

const THREAD_STORAGE_KEY = 'viktkollen.aiHelp.thread'

function AiHelpPanel() {
  const { i18n } = useTranslation()
  const languageCode = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language)
  const direction = getLanguageDefinition(languageCode).direction === 'rtl' ? 'rtl' : 'ltr'
  const chrome = helpChrome(languageCode)
  const [open, setOpen] = useState(() => (
    typeof window !== 'undefined' && window.location.hash.replace(/^#/, '') === 'ai-help'
  ))
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [openedSections, setOpenedSections] = useState({})

  useEffect(() => {
    function onSectionOpened(event) {
      const sectionId = String(event?.detail?.sectionId || '')
      if (!sectionId) return
      setOpenedSections((current) => ({ ...current, [sectionId]: true }))
    }
    window.addEventListener('viktkollen:ai-help-section-opened', onSectionOpened)
    return () => window.removeEventListener('viktkollen:ai-help-section-opened', onSectionOpened)
  }, [])

  useEffect(() => {
    // Remove legacy threads: they can contain private account facts and stale actions.
    try { window.sessionStorage.removeItem(THREAD_STORAGE_KEY) } catch { /* Storage may be disabled. */ }
  }, [])

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash.replace(/^#/, '') === 'ai-help') setOpen(true)
    }
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  async function confirmMessageAction(index) {
    if (pending) return
    const confirmation = messages[index]?.confirmation
    setPending(true)
    setNotice('')
    try {
      const result = await confirmAiAction(confirmation?.userScope, confirmation)
      setMessages((current) => {
        const message = current[index]
        if (!message?.confirmation?.action) return current
        const done = {
          delete_account: chrome.deleteDone,
          hosted_checkout: chrome.checkoutReady,
          password_reset: chrome.passwordDone,
          plan_change: chrome.planDone,
          schedule_cancel: chrome.cancelDone,
          undo_cancel: chrome.undoDone,
        }[message.confirmation.action] || chrome.cancelFailed
        const failed = {
          delete_account: chrome.deleteFailed,
          hosted_checkout: chrome.checkoutFailed,
          password_reset: chrome.passwordFailed,
          plan_change: chrome.planFailed,
          schedule_cancel: chrome.cancelFailed,
          undo_cancel: chrome.undoFailed,
        }[message.confirmation.action] || chrome.cancelFailed
        const hostedCheckoutUrl = result.ok ? officialSumUpHostedCheckoutUrl(result.hostedCheckoutUrl) : ''
        if (hostedCheckoutUrl) window.open(hostedCheckoutUrl, '_blank', 'noopener,noreferrer')
        const next = current.map((item, itemIndex) => (
          itemIndex === index ? { ...item, confirmation: null } : item
        ))
        return [
          ...next,
          {
            content: result.ok && (message.confirmation.action !== 'hosted_checkout' || hostedCheckoutUrl) ? done : failed,
            featureIds: [],
            hostedCheckoutUrl,
            role: 'assistant',
            status: 'answered',
          },
        ]
      })
    } catch {
      setNotice(chrome.error)
    } finally {
      setPending(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const content = draft.replace(/\s+/g, ' ').trim()
    if (!content || pending) return

    const switched = requestedLanguageSwitch(content)
    if (switched) {
      await changeAppLanguage(switched)
      setMessages((current) => [
        ...current.slice(-7),
        { content, featureIds: [], role: 'user', status: 'asked' },
        { content: helpChrome(switched).languageSwitched, featureIds: [], role: 'assistant', status: 'answered' },
      ])
      setDraft('')
      return
    }

    const previous = messages.slice(-7)
    const nextMessages = [...previous.map((message) => ({ ...message, confirmation: null })), { content, featureIds: [], role: 'user', status: 'asked' }]
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    setMessages(nextMessages)
    setDraft('')
    setPending(true)
    setNotice('')

    try {
      const result = await requestAiHelpReply({
        featureIds: lastAssistant?.featureIds || [],
        languageCode,
        messages: nextMessages.map((message) => ({ content: message.content, role: message.role })),
      })

      if (!result.ok) {
        if (result.code === 'AUTH_REQUIRED') setNotice(chrome.signIn)
        else if (result.code === 'MODEL_LIMITED') setNotice(chrome.modelLimited)
        else setNotice(chrome.error)
        return
      }

      if (result.source === 'out-of-scope') {
        setMessages((current) => [
          ...current,
          { content: chrome.outOfScope, featureIds: [], role: 'assistant', status: 'unanswered' },
        ])
        return
      }

      if (result.source === 'local-fallback') setNotice(chrome.modelLimited)

      if (result.status === 'unanswered') {
        setMessages((current) => [
          ...current,
          { content: chrome.unanswered, featureIds: [], role: 'assistant', status: 'unanswered' },
        ])
        return
      }

      if (result.tool?.name === 'open-section' && isDirectNavigationRequest(content)) {
        requestOpenHelpSection(result.tool.sectionId, result.tool.targetId)
      }

      setMessages((current) => [
        ...current,
        {
          confirmation: result.confirmation || null,
          content: result.answer,
          featureIds: result.featureIds,
          followUps: result.followUps || [],
          handoff: result.handoff === true,
          role: 'assistant',
          status: 'answered',
          tool: result.tool || null,
        },
      ])
    } catch {
      setNotice(chrome.error)
    } finally {
      setPending(false)
    }
  }

  async function reportTechnicalProblem() {
    const result = await reportClientBug({
      errorType: 'ai-help',
      feature: 'ai-help',
      fingerprint: 'ai-help-manual',
      severity: 'medium',
      source: 'ai-help',
    }, { force: true })
    setNotice(result.ok ? chrome.bugReported : chrome.bugFailed)
  }

  return (
    <section aria-label={chrome.title} className="ai-help-panel" dir={direction} lang={languageCode}>
      <div className="panel-heading">
        <h2>{chrome.title}</h2>
        <button className="secondary-button" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? chrome.close : chrome.open}
        </button>
      </div>

      {open && (
        <>
          <div aria-live="polite" className="ai-help-thread" role="log">
            {messages.length === 0 && <p className="ai-help-note">{chrome.empty}</p>}
            {messages.map((message, index) => (
              <div className={`ai-help-message is-${message.role}`} key={`${message.role}-${index}`}>
                <p>{message.content}</p>
                {message.confirmation?.action === 'schedule_cancel' && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    disabled={pending}
                    onClick={() => confirmMessageAction(index)}
                  >
                    {chrome.confirmCancel}
                  </button>
                )}
                {message.confirmation?.action === 'undo_cancel' && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    disabled={pending}
                    onClick={() => confirmMessageAction(index)}
                  >
                    {chrome.confirmUndo}
                  </button>
                )}
                {message.confirmation?.action === 'plan_change' && message.confirmation.planId && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    disabled={pending}
                    onClick={() => confirmMessageAction(index)}
                  >
                    {chrome.confirmPlan}
                  </button>
                )}
                {message.confirmation?.action === 'hosted_checkout' && message.confirmation.planId && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    disabled={pending}
                    onClick={() => confirmMessageAction(index)}
                  >
                    {chrome.confirmCheckout}
                  </button>
                )}
                {message.confirmation?.action === 'password_reset' && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    disabled={pending}
                    onClick={() => confirmMessageAction(index)}
                  >
                    {chrome.confirmPassword}
                  </button>
                )}
                {message.confirmation?.action === 'delete_account' && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    disabled={pending}
                    onClick={() => confirmMessageAction(index)}
                  >
                    {chrome.confirmDelete}
                  </button>
                )}
                {message.hostedCheckoutUrl && (
                  <a href={message.hostedCheckoutUrl} rel="noreferrer" target="_blank">{chrome.openCheckout}</a>
                )}
                {(message.followUps || []).map((question) => (
                  <button
                    className="secondary-button ai-help-action"
                    key={question}
                    type="button"
                    onClick={() => setDraft(question)}
                  >
                    {question}
                  </button>
                ))}
                {message.handoff && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('viktkollen:open-human-support'))}
                  >
                    {chrome.handoff}
                  </button>
                )}
                {message.tool?.name === 'open-section' && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    onClick={() => requestOpenHelpSection(message.tool.sectionId, message.tool.targetId)}
                  >
                    {openedSections[message.tool.sectionId] ? chrome.opened : languageCode === 'sv' ? message.tool.label : chrome.openSection}
                  </button>
                )}
              </div>
            ))}
          </div>
          {notice && <p className="ai-help-note">{notice}</p>}
          <p className="ai-help-note">{chrome.humanSupport}</p>
          <form className="ai-help-form" onSubmit={handleSubmit}>
            <textarea
              aria-label={chrome.placeholder}
              value={draft}
              placeholder={chrome.placeholder}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="secondary-button" type="submit" disabled={pending || !draft.trim()}>
              {chrome.send}
            </button>
            <button className="secondary-button" type="button" onClick={reportTechnicalProblem}>
              {chrome.bugReport}
            </button>
          </form>
          <SupportPanel />
        </>
      )}
    </section>
  )
}

export default AiHelpPanel
