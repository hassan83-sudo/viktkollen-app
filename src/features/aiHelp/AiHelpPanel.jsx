import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLanguageDefinition, normalizeLanguageCode } from '../../i18n/languages.js'
import { confirmScheduleCancel, requestAiHelpReply } from './aiHelpClient.js'
import { requestOpenHelpSection } from './aiHelpTools.js'
import { helpChrome } from './uiChrome.js'
import './AiHelpPanel.css'

const THREAD_STORAGE_KEY = 'viktkollen.aiHelp.thread'

function readStoredThread() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(THREAD_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.slice(-8) : []
  } catch {
    return []
  }
}

function AiHelpPanel() {
  const { i18n } = useTranslation()
  const languageCode = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language)
  const direction = getLanguageDefinition(languageCode).direction === 'rtl' ? 'rtl' : 'ltr'
  const chrome = helpChrome(languageCode)
  const [open, setOpen] = useState(() => (
    typeof window !== 'undefined' && window.location.hash.replace(/^#/, '') === 'ai-help'
  ))
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState(readStoredThread)
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
    window.sessionStorage.setItem(THREAD_STORAGE_KEY, JSON.stringify(messages.slice(-8)))
  }, [messages])

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash.replace(/^#/, '') === 'ai-help') setOpen(true)
    }
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  async function confirmMessageCancel(index) {
    if (pending) return
    setPending(true)
    setNotice('')
    try {
      const result = await confirmScheduleCancel()
      setMessages((current) => {
        const message = current[index]
        if (message?.confirmation?.action !== 'schedule_cancel') return current
        const next = current.map((item, itemIndex) => (
          itemIndex === index ? { ...item, confirmation: null } : item
        ))
        return [
          ...next,
          {
            content: result.ok ? chrome.cancelDone : chrome.cancelFailed,
            featureIds: [],
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

    const previous = messages.slice(-7)
    const nextMessages = [...previous, { content, featureIds: [], role: 'user', status: 'asked' }]
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

      setMessages((current) => [
        ...current,
        {
          confirmation: result.confirmation || null,
          content: result.answer,
          featureIds: result.featureIds,
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
                    onClick={() => confirmMessageCancel(index)}
                  >
                    {chrome.confirmCancel}
                  </button>
                )}
                {message.tool?.name === 'open-section' && (
                  <button
                    className="secondary-button ai-help-action"
                    type="button"
                    onClick={() => requestOpenHelpSection(message.tool.sectionId)}
                  >
                    {openedSections[message.tool.sectionId] ? chrome.opened : message.tool.label}
                  </button>
                )}
              </div>
            ))}
          </div>
          {notice && <p className="ai-help-note">{notice}</p>}
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
          </form>
        </>
      )}
    </section>
  )
}

export default AiHelpPanel
