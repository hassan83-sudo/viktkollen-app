import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccessibilityPreferences } from '../../services/accessibilityPreferences.js'
import {
  cancelAccessibilitySpeech,
  speakAccessibilityText,
} from '../../services/accessibilitySpeech.js'
import {
  addCommunicationPhrase,
  maxCommunicationPhraseLength,
  maxCommunicationPhrases,
  readCommunicationPhrases,
  removeCommunicationPhrase,
  restoreCommunicationPhrase,
} from '../../services/accessibilityCommunicationPhrases.js'
import AccessibilityFeedback from './AccessibilityFeedback.jsx'

const phraseGroups = [
  { id: 'basic', phrases: ['yes', 'no', 'thanks'] },
  { id: 'needs', phrases: ['wait', 'pause', 'hungry', 'thirsty', 'toilet'] },
  { id: 'help', phrases: ['help', 'needHelp', 'callContact', 'cannotSpeakNow'] },
  { id: 'wellbeing', phrases: ['pain', 'tired', 'wantHome'] },
  { id: 'communication', phrases: ['dontUnderstand', 'writeInstead', 'repeat'] },
]

// A11Y-7D: a symbol only ever supplements the visible phrase text below - it
// is rendered aria-hidden, so it never becomes (or replaces) the button's
// accessible name, and it is never the only indicator of what a phrase is.
// Local Unicode/emoji only - no external icon API or network-loaded library.
const phraseSymbols = {
  yes: '✓',
  no: '✕',
  thanks: '🙏',
  wait: '⏳',
  pause: '⏸',
  hungry: '🍽',
  thirsty: '🥤',
  toilet: '🚻',
  help: '🆘',
  needHelp: '🙋',
  callContact: '☎',
  cannotSpeakNow: '💬',
  pain: '⚠',
  tired: '😴',
  wantHome: '🏠',
  dontUnderstand: '❓',
  writeInstead: '✍',
  repeat: '↻',
}

function AccessibilityCommunication() {
  const { i18n, t } = useTranslation('settings')
  // A11Y-8A: manual read-aloud uses the same stored speech-rate preference as
  // navigation speech (slow/normal/fast), never a second rate setting.
  const { navigationSpeechRate } = useAccessibilityPreferences()
  const [customText, setCustomText] = useState('')
  const [clearedText, setClearedText] = useState('')
  const [largeTextOpen, setLargeTextOpen] = useState(false)
  const [speechStatus, setSpeechStatus] = useState(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechSource, setSpeechSource] = useState(null)
  const [savedPhrases, setSavedPhrases] = useState(() => readCommunicationPhrases())
  const [newPhraseText, setNewPhraseText] = useState('')
  const [phraseFormStatus, setPhraseFormStatus] = useState(null)
  const [deletePhraseId, setDeletePhraseId] = useState('')
  const [lastDeletedPhrase, setLastDeletedPhrase] = useState(null)
  const largeTextTriggerRef = useRef(null)
  const largeTextCloseRef = useRef(null)
  const largeTextSectionRef = useRef(null)
  const restoreLargeTextFocusRef = useRef(false)
  const customTextRef = useRef(null)
  const restoreTextButtonRef = useRef(null)
  const phraseInputRef = useRef(null)
  const undoDeletePhraseRef = useRef(null)
  const savedPhraseButtonRefs = useRef({})
  const deletePhraseButtonRefs = useRef({})
  const cancelDeletePhraseRef = useRef(null)
  // A11Y-8A: focus requested by a user action that changes which controls
  // exist (clear, delete, undo). It is resolved after the next render, so
  // focus is only ever moved to an element that is actually mounted.
  const pendingFocusRef = useRef(null)
  // A11Y-8F: "Stoppa" only exists while speaking. When it disappears while it
  // has focus (stopped by the user or speech ended), focus moves to the
  // matching "Läs upp" button instead of falling back to <body>.
  const speakButtonRefs = useRef({})
  const speechRequestRef = useRef(0)
  const announcementRef = useRef(0)

  const selectedText = customText.trim()
  const phraseLimitReached = savedPhrases.length >= maxCommunicationPhrases
  const phraseLimitHintId = 'communication-my-phrases-limit'
  const phraseFormStatusId = 'communication-my-phrases-status'

  function nextAnnouncementId() {
    announcementRef.current += 1
    return announcementRef.current
  }

  // repeat: true re-announces an identical message after an explicit user
  // action that needs fresh feedback; otherwise an identical message is kept
  // as-is and is not announced twice.
  function setSpeechFeedback(message, tone = 'info', { repeat = false } = {}) {
    const id = nextAnnouncementId()
    setSpeechStatus((current) => (
      !repeat && current?.message === message && current.tone === tone ? current : { id, message, tone }
    ))
  }

  function focusAfterRender(getElement) {
    pendingFocusRef.current = getElement
  }

  useEffect(() => {
    const getElement = pendingFocusRef.current
    if (!getElement) return
    pendingFocusRef.current = null
    getElement()?.focus()
  })

  function keepFocusFromStopButton() {
    const source = document.activeElement?.getAttribute?.('data-speech-stop')
    if (source) focusAfterRender(() => speakButtonRefs.current[source])
  }

  function stopSpeaking() {
    keepFocusFromStopButton()
    speechRequestRef.current += 1
    cancelAccessibilitySpeech()
    setIsSpeaking(false)
    setSpeechSource(null)
  }

  function stopSpeakingWithStatus() {
    stopSpeaking()
    setSpeechFeedback(t('accessibility.communication.stopped'), 'warning', { repeat: true })
  }

  useEffect(() => () => {
    speechRequestRef.current += 1
    cancelAccessibilitySpeech()
  }, [])

  // A11Y-8A: focus only returns to "Visa stort" after the user explicitly
  // closes the large view (Close button, or Escape while working in it).
  // Closing it as a side effect of typing, clearing or picking a phrase never
  // moves focus away from where the user is working.
  function closeLargeText({ restoreFocus = false } = {}) {
    restoreLargeTextFocusRef.current = restoreFocus
    setLargeTextOpen(false)
  }

  useEffect(() => {
    if (!largeTextOpen) {
      if (restoreLargeTextFocusRef.current) {
        restoreLargeTextFocusRef.current = false
        largeTextTriggerRef.current?.focus()
      }
      return undefined
    }

    largeTextCloseRef.current?.focus()

    function closeLargeTextOnEscape(event) {
      if (event.key !== 'Escape') return
      const activeElement = document.activeElement
      restoreLargeTextFocusRef.current = !activeElement
        || activeElement === document.body
        || Boolean(largeTextSectionRef.current?.contains(activeElement))
      setLargeTextOpen(false)
    }

    window.addEventListener('keydown', closeLargeTextOnEscape)
    return () => window.removeEventListener('keydown', closeLargeTextOnEscape)
  }, [largeTextOpen])

  function applySelectedText(text) {
    stopSpeaking()
    closeLargeText()
    setSpeechStatus(null)
    setClearedText('')
    setCustomText(text)
  }

  function selectPhrase(phraseId) {
    applySelectedText(t(`accessibility.communication.phrases.${phraseId}`))
  }

  // A11Y-7E: a saved custom phrase feeds into the exact same flow as a
  // built-in phrase - it just becomes selectedText, so Speak/Stop/Show
  // large/Clear all work identically and nothing auto-speaks.
  function selectSavedPhrase(phrase) {
    applySelectedText(phrase.text)
  }

  // Every submit gets a fresh announcement id, so repeating the same save
  // result or the same error is announced again.
  function savePhrase(event) {
    event.preventDefault()
    const result = addCommunicationPhrase(newPhraseText)
    if (result.error) {
      setPhraseFormStatus({ id: nextAnnouncementId(), message: t(`accessibility.communication.myPhrases.${result.error}`), tone: 'error' })
      return
    }
    setSavedPhrases(result.phrases)
    setNewPhraseText('')
    setPhraseFormStatus({ id: nextAnnouncementId(), message: t('accessibility.communication.myPhrases.saved'), tone: 'success' })
  }

  // A11Y-8A: the inline delete confirmation takes focus on its safe choice
  // (Avbryt); cancelling, also with Escape, returns focus to that phrase's
  // delete button.
  function requestDeletePhrase(id) {
    setDeletePhraseId(id)
    focusAfterRender(() => cancelDeletePhraseRef.current)
  }

  function cancelDeletePhrase() {
    const id = deletePhraseId
    setDeletePhraseId('')
    focusAfterRender(() => deletePhraseButtonRefs.current[id])
  }

  function handleDeleteConfirmKeyDown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    cancelDeletePhrase()
  }

  // After a confirmed delete the tile is gone, so focus moves to the Undo
  // action that appears in its place; after Undo, to the restored phrase.
  function confirmDeletePhrase(phrase) {
    setSavedPhrases(removeCommunicationPhrase(phrase.id))
    setDeletePhraseId('')
    setLastDeletedPhrase(phrase)
    focusAfterRender(() => undoDeletePhraseRef.current || phraseInputRef.current)
  }

  function undoDeletePhrase() {
    if (!lastDeletedPhrase) return
    const restoredId = lastDeletedPhrase.id
    setSavedPhrases(restoreCommunicationPhrase(lastDeletedPhrase))
    setLastDeletedPhrase(null)
    focusAfterRender(() => savedPhraseButtonRefs.current[restoredId] || phraseInputRef.current)
  }

  function updateCustomText(event) {
    stopSpeaking()
    closeLargeText()
    setSpeechStatus(null)
    setClearedText('')
    setCustomText(event.target.value)
  }

  function speakText(text, source) {
    const requestId = speechRequestRef.current + 1
    speechRequestRef.current = requestId
    const didSpeak = speakAccessibilityText({
      language: i18n.language,
      rate: navigationSpeechRate,
      text,
      onEnd: () => {
        if (speechRequestRef.current !== requestId) return
        keepFocusFromStopButton()
        setIsSpeaking(false)
        setSpeechSource(null)
        setSpeechFeedback(t('accessibility.communication.complete'), 'success')
      },
      onError: () => {
        if (speechRequestRef.current !== requestId) return
        keepFocusFromStopButton()
        setIsSpeaking(false)
        setSpeechSource(null)
        setSpeechFeedback(t('accessibility.communication.error'), 'error')
      },
    })
    if (!didSpeak) {
      setSpeechFeedback(t('accessibility.communication.unsupported'), 'error', { repeat: true })
      return
    }
    setIsSpeaking(true)
    setSpeechSource(source)
    setSpeechFeedback(t('accessibility.communication.speaking'))
  }

  function speakSelectedText() {
    speakText(selectedText, 'message')
  }

  function speakGuidance() {
    speakText(t('accessibility.communication.guidanceReadText'), 'guidance')
  }

  // Clearing removes the selected-text controls (Rensa itself and, if open,
  // the large view), so focus moves to "Ångra rensning", the control that
  // takes their place, instead of being dropped on <body>.
  function clearText() {
    stopSpeaking()
    setClearedText(customText)
    setCustomText('')
    closeLargeText()
    setSpeechStatus(null)
    focusAfterRender(() => restoreTextButtonRef.current || customTextRef.current)
  }

  function restoreClearedText() {
    setCustomText(clearedText)
    setClearedText('')
    focusAfterRender(() => customTextRef.current)
  }

  return (
    <section className="accessibility-communication" aria-label={t('accessibility.communication.label')}>
      <p className="accessibility-communication-privacy">{t('accessibility.communication.privacy')}</p>
      <details className="accessibility-communication-guidance">
        <summary>{t('accessibility.communication.guidanceTitle')}</summary>
        <ol>
          {['select', 'showOrRead', 'stop'].map((step) => (
            <li key={step}>{t(`accessibility.communication.guidanceSteps.${step}`)}</li>
          ))}
        </ol>
        <div className="accessibility-communication-actions">
          <button className="secondary-button" ref={(element) => { speakButtonRefs.current.guidance = element }} type="button" onClick={speakGuidance}>
            {t('accessibility.communication.readGuidance')}
          </button>
          {isSpeaking && speechSource === 'guidance' && (
            <button className="secondary-button" data-speech-stop="guidance" type="button" onClick={stopSpeakingWithStatus}>
              {t('accessibility.communication.stop')}
            </button>
          )}
        </div>
      </details>
      {phraseGroups.map((group) => (
        <section className="accessibility-phrase-group" aria-labelledby={`communication-${group.id}`} key={group.id}>
          <h3 id={`communication-${group.id}`}>{t(`accessibility.communication.groups.${group.id}`)}</h3>
          <div className="accessibility-phrase-grid">
            {group.phrases.map((phraseId) => {
              const phrase = t(`accessibility.communication.phrases.${phraseId}`)
              return (
                <button
                  aria-pressed={selectedText === phrase}
                  className="accessibility-phrase-button"
                  key={phraseId}
                  type="button"
                  onClick={() => selectPhrase(phraseId)}
                >
                  <span aria-hidden="true" className="accessibility-phrase-symbol">{phraseSymbols[phraseId]}</span>
                  <span className="accessibility-phrase-text">{phrase}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <section className="accessibility-phrase-group accessibility-my-phrases" aria-labelledby="communication-my-phrases">
        <h3 id="communication-my-phrases">{t('accessibility.communication.myPhrases.title')}</h3>
        <p className="accessibility-communication-privacy">{t('accessibility.communication.myPhrases.privacy')}</p>

        {/* A11Y-8A: at the limit Spara stays enabled instead of becoming a
            silently disabled control. The reason is shown and tied to the
            field, and saving anyway repeats it as an error status. */}
        <form className="accessibility-my-phrase-form" onSubmit={savePhrase}>
          <label>
            <span>{t('accessibility.communication.myPhrases.inputLabel')}</span>
            <input
              aria-describedby={
                phraseFormStatus?.tone === 'error'
                  ? phraseFormStatusId
                  : (phraseLimitReached ? phraseLimitHintId : undefined)
              }
              aria-invalid={phraseFormStatus?.tone === 'error' || undefined}
              maxLength={maxCommunicationPhraseLength}
              ref={phraseInputRef}
              type="text"
              value={newPhraseText}
              onChange={(event) => setNewPhraseText(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit">
            {t('accessibility.communication.myPhrases.save')}
          </button>
        </form>
        {phraseLimitReached && (
          <p className="accessibility-preference-note" id={phraseLimitHintId}>
            {t('accessibility.communication.myPhrases.limitReached')}
          </p>
        )}
        <AccessibilityFeedback
          announcementId={phraseFormStatus?.id}
          id={phraseFormStatusId}
          message={phraseFormStatus?.message}
          tone={phraseFormStatus?.tone}
        />

        {savedPhrases.length === 0 ? (
          <p>{t('accessibility.communication.myPhrases.emptyList')}</p>
        ) : (
          <div className="accessibility-phrase-grid accessibility-my-phrase-grid">
            {savedPhrases.map((phrase) => (
              <div className="accessibility-my-phrase-tile" key={phrase.id}>
                <button
                  aria-pressed={selectedText === phrase.text}
                  className="accessibility-phrase-button"
                  ref={(node) => {
                    savedPhraseButtonRefs.current[phrase.id] = node
                  }}
                  type="button"
                  onClick={() => selectSavedPhrase(phrase)}
                >
                  <span aria-hidden="true" className="accessibility-phrase-symbol">★</span>
                  <span className="accessibility-phrase-text">{phrase.text}</span>
                </button>
                {deletePhraseId === phrase.id ? (
                  <div
                    aria-labelledby="communication-phrase-delete-question"
                    className="accessibility-my-phrase-delete-confirm"
                    role="group"
                    onKeyDown={handleDeleteConfirmKeyDown}
                  >
                    <p id="communication-phrase-delete-question">{t('accessibility.communication.myPhrases.deleteConfirm', { phrase: phrase.text })}</p>
                    <div className="accessibility-communication-actions">
                      <button className="secondary-button" type="button" onClick={() => confirmDeletePhrase(phrase)}>
                        {t('accessibility.communication.myPhrases.deleteYes')}
                      </button>
                      <button className="secondary-button" ref={cancelDeletePhraseRef} type="button" onClick={cancelDeletePhrase}>
                        {t('accessibility.communication.myPhrases.deleteNo')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    aria-label={t('accessibility.communication.myPhrases.deleteAria', { phrase: phrase.text })}
                    className="secondary-button accessibility-my-phrase-delete"
                    ref={(node) => {
                      deletePhraseButtonRefs.current[phrase.id] = node
                    }}
                    type="button"
                    onClick={() => requestDeletePhrase(phrase.id)}
                  >
                    {t('accessibility.communication.myPhrases.delete')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {lastDeletedPhrase && (
          <button className="secondary-button accessibility-restore-button" ref={undoDeletePhraseRef} type="button" onClick={undoDeletePhrase}>
            {t('accessibility.communication.myPhrases.undoDelete', { phrase: lastDeletedPhrase.text })}
          </button>
        )}
      </section>

      <label className="accessibility-custom-text">
        <span>{t('accessibility.communication.customLabel')}</span>
        <textarea
          data-a11y-private="true"
          ref={customTextRef}
          maxLength={280}
          onChange={updateCustomText}
          placeholder={t('accessibility.communication.customPlaceholder')}
          rows={3}
          value={customText}
        />
      </label>

      {selectedText && (
        <section className="accessibility-selected-phrase">
          <p className="eyebrow">{t('accessibility.communication.selectedLabel')}</p>
          <strong>{selectedText}</strong>
          <div className="accessibility-communication-actions">
            <button className="primary-button" ref={(element) => { speakButtonRefs.current.message = element }} type="button" onClick={speakSelectedText}>
              {t('accessibility.communication.speak')}
            </button>
            {isSpeaking && speechSource === 'message' && (
              <button className="secondary-button" data-speech-stop="message" type="button" onClick={stopSpeakingWithStatus}>
                {t('accessibility.communication.stop')}
              </button>
            )}
            <button
              className="secondary-button"
              ref={largeTextTriggerRef}
              type="button"
              onClick={() => setLargeTextOpen(true)}
            >
              {t('accessibility.communication.showLarge')}
            </button>
            <button className="secondary-button" type="button" onClick={clearText}>
              {t('accessibility.communication.clear')}
            </button>
          </div>
        </section>
      )}
      {clearedText && (
        <button className="secondary-button accessibility-restore-button" ref={restoreTextButtonRef} type="button" onClick={restoreClearedText}>
          {t('accessibility.communication.restore')}
        </button>
      )}

      <AccessibilityFeedback announcementId={speechStatus?.id} message={speechStatus?.message} tone={speechStatus?.tone} />

      <article className="accessibility-planned-card">
        <h3>{t('accessibility.communication.writeToAi')}</h3>
        <p>{t('accessibility.communication.writeToAiNote')}</p>
      </article>

      {largeTextOpen && (
        <section className="accessibility-large-text" aria-label={t('accessibility.communication.largeLabel')} ref={largeTextSectionRef}>
          <p>{selectedText}</p>
          <button className="primary-button" ref={largeTextCloseRef} type="button" onClick={() => closeLargeText({ restoreFocus: true })}>
            {t('accessibility.communication.closeLarge')}
          </button>
        </section>
      )}
    </section>
  )
}

export default AccessibilityCommunication
