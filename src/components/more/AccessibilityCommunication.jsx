import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const speechRequestRef = useRef(0)

  const selectedText = customText.trim()

  function setSpeechFeedback(message, tone = 'info') {
    setSpeechStatus((current) => (
      current?.message === message && current.tone === tone ? current : { message, tone }
    ))
  }

  function stopSpeaking() {
    speechRequestRef.current += 1
    cancelAccessibilitySpeech()
    setIsSpeaking(false)
    setSpeechSource(null)
  }

  function stopSpeakingWithStatus() {
    stopSpeaking()
    setSpeechFeedback(t('accessibility.communication.stopped'), 'warning')
  }

  useEffect(() => () => {
    speechRequestRef.current += 1
    cancelAccessibilitySpeech()
  }, [])

  useEffect(() => {
    if (!largeTextOpen) {
      largeTextTriggerRef.current?.focus()
      return undefined
    }

    largeTextCloseRef.current?.focus()

    function closeLargeTextOnEscape(event) {
      if (event.key === 'Escape') setLargeTextOpen(false)
    }

    window.addEventListener('keydown', closeLargeTextOnEscape)
    return () => window.removeEventListener('keydown', closeLargeTextOnEscape)
  }, [largeTextOpen])

  function applySelectedText(text) {
    stopSpeaking()
    setLargeTextOpen(false)
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

  function savePhrase(event) {
    event.preventDefault()
    const result = addCommunicationPhrase(newPhraseText)
    if (result.error) {
      setPhraseFormStatus({ message: t(`accessibility.communication.myPhrases.${result.error}`), tone: 'error' })
      return
    }
    setSavedPhrases(result.phrases)
    setNewPhraseText('')
    setPhraseFormStatus({ message: t('accessibility.communication.myPhrases.saved'), tone: 'success' })
  }

  function requestDeletePhrase(id) {
    setDeletePhraseId(id)
  }

  function cancelDeletePhrase() {
    setDeletePhraseId('')
  }

  function confirmDeletePhrase(phrase) {
    setSavedPhrases(removeCommunicationPhrase(phrase.id))
    setDeletePhraseId('')
    setLastDeletedPhrase(phrase)
  }

  function undoDeletePhrase() {
    if (!lastDeletedPhrase) return
    setSavedPhrases(restoreCommunicationPhrase(lastDeletedPhrase))
    setLastDeletedPhrase(null)
  }

  function updateCustomText(event) {
    stopSpeaking()
    setLargeTextOpen(false)
    setSpeechStatus(null)
    setClearedText('')
    setCustomText(event.target.value)
  }

  function speakText(text, source) {
    const requestId = speechRequestRef.current + 1
    speechRequestRef.current = requestId
    const didSpeak = speakAccessibilityText({
      language: i18n.language,
      text,
      onEnd: () => {
        if (speechRequestRef.current !== requestId) return
        setIsSpeaking(false)
        setSpeechSource(null)
        setSpeechFeedback(t('accessibility.communication.complete'), 'success')
      },
      onError: () => {
        if (speechRequestRef.current !== requestId) return
        setIsSpeaking(false)
        setSpeechSource(null)
        setSpeechFeedback(t('accessibility.communication.error'), 'error')
      },
    })
    if (!didSpeak) {
      setSpeechFeedback(t('accessibility.communication.unsupported'), 'error')
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

  function clearText() {
    stopSpeaking()
    setClearedText(customText)
    setCustomText('')
    setLargeTextOpen(false)
    setSpeechStatus(null)
  }

  function restoreClearedText() {
    setCustomText(clearedText)
    setClearedText('')
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
          <button className="secondary-button" type="button" onClick={speakGuidance}>
            {t('accessibility.communication.readGuidance')}
          </button>
          {isSpeaking && speechSource === 'guidance' && (
            <button className="secondary-button" type="button" onClick={stopSpeakingWithStatus}>
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

        <form className="accessibility-my-phrase-form" onSubmit={savePhrase}>
          <label>
            <span>{t('accessibility.communication.myPhrases.inputLabel')}</span>
            <input
              maxLength={maxCommunicationPhraseLength}
              type="text"
              value={newPhraseText}
              onChange={(event) => setNewPhraseText(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={savedPhrases.length >= maxCommunicationPhrases} type="submit">
            {t('accessibility.communication.myPhrases.save')}
          </button>
        </form>
        <AccessibilityFeedback message={phraseFormStatus?.message} tone={phraseFormStatus?.tone} />

        {savedPhrases.length === 0 ? (
          <p>{t('accessibility.communication.myPhrases.emptyList')}</p>
        ) : (
          <div className="accessibility-phrase-grid accessibility-my-phrase-grid">
            {savedPhrases.map((phrase) => (
              <div className="accessibility-my-phrase-tile" key={phrase.id}>
                <button
                  aria-pressed={selectedText === phrase.text}
                  className="accessibility-phrase-button"
                  type="button"
                  onClick={() => selectSavedPhrase(phrase)}
                >
                  <span aria-hidden="true" className="accessibility-phrase-symbol">★</span>
                  <span className="accessibility-phrase-text">{phrase.text}</span>
                </button>
                {deletePhraseId === phrase.id ? (
                  <div className="accessibility-my-phrase-delete-confirm" role="alert">
                    <p>{t('accessibility.communication.myPhrases.deleteConfirm', { phrase: phrase.text })}</p>
                    <div className="accessibility-communication-actions">
                      <button className="secondary-button" type="button" onClick={() => confirmDeletePhrase(phrase)}>
                        {t('accessibility.communication.myPhrases.deleteYes')}
                      </button>
                      <button className="secondary-button" type="button" onClick={cancelDeletePhrase}>
                        {t('accessibility.communication.myPhrases.deleteNo')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    aria-label={t('accessibility.communication.myPhrases.deleteAria', { phrase: phrase.text })}
                    className="secondary-button accessibility-my-phrase-delete"
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
          <button className="secondary-button accessibility-restore-button" type="button" onClick={undoDeletePhrase}>
            {t('accessibility.communication.myPhrases.undoDelete', { phrase: lastDeletedPhrase.text })}
          </button>
        )}
      </section>

      <label className="accessibility-custom-text">
        <span>{t('accessibility.communication.customLabel')}</span>
        <textarea
          data-a11y-private="true"
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
            <button className="primary-button" type="button" onClick={speakSelectedText}>
              {t('accessibility.communication.speak')}
            </button>
            {isSpeaking && speechSource === 'message' && (
              <button className="secondary-button" type="button" onClick={stopSpeakingWithStatus}>
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
        <button className="secondary-button accessibility-restore-button" type="button" onClick={restoreClearedText}>
          {t('accessibility.communication.restore')}
        </button>
      )}

      <AccessibilityFeedback message={speechStatus?.message} tone={speechStatus?.tone} />

      <article className="accessibility-planned-card">
        <h3>{t('accessibility.communication.writeToAi')}</h3>
        <p>{t('accessibility.communication.writeToAiNote')}</p>
      </article>

      {largeTextOpen && (
        <section className="accessibility-large-text" aria-label={t('accessibility.communication.largeLabel')}>
          <p>{selectedText}</p>
          <button className="primary-button" ref={largeTextCloseRef} type="button" onClick={() => setLargeTextOpen(false)}>
            {t('accessibility.communication.closeLarge')}
          </button>
        </section>
      )}
    </section>
  )
}

export default AccessibilityCommunication
