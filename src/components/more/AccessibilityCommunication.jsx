import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const phraseGroups = [
  { id: 'basic', phrases: ['yes', 'no', 'thanks'] },
  { id: 'needs', phrases: ['hungry', 'thirsty', 'toilet', 'pause'] },
  { id: 'help', phrases: ['help', 'callContact'] },
  { id: 'wellbeing', phrases: ['pain'] },
  { id: 'communication', phrases: ['dontUnderstand', 'repeat'] },
]

function getSpeechApi() {
  if (typeof window === 'undefined') return null

  const synthesis = window.speechSynthesis
  const Utterance = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance

  if (!synthesis?.speak || !Utterance) return null

  return { synthesis, Utterance }
}

function AccessibilityCommunication() {
  const { t } = useTranslation('settings')
  const [customText, setCustomText] = useState('')
  const [largeTextOpen, setLargeTextOpen] = useState(false)
  const [selectedPhrase, setSelectedPhrase] = useState('')
  const [speechStatus, setSpeechStatus] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)

  const selectedText = selectedPhrase || customText.trim()

  function stopSpeaking() {
    getSpeechApi()?.synthesis.cancel?.()
    setIsSpeaking(false)
  }

  function stopSpeakingWithStatus() {
    stopSpeaking()
    setSpeechStatus(t('accessibility.communication.stopped'))
  }

  useEffect(() => () => {
    getSpeechApi()?.synthesis.cancel?.()
  }, [])

  useEffect(() => {
    if (!largeTextOpen) return undefined

    function closeLargeTextOnEscape(event) {
      if (event.key === 'Escape') setLargeTextOpen(false)
    }

    window.addEventListener('keydown', closeLargeTextOnEscape)
    return () => window.removeEventListener('keydown', closeLargeTextOnEscape)
  }, [largeTextOpen])

  function selectPhrase(phraseId) {
    stopSpeaking()
    setLargeTextOpen(false)
    setSpeechStatus('')
    setSelectedPhrase(t(`accessibility.communication.phrases.${phraseId}`))
  }

  function updateCustomText(event) {
    stopSpeaking()
    setLargeTextOpen(false)
    setSpeechStatus('')
    setSelectedPhrase('')
    setCustomText(event.target.value)
  }

  function speakSelectedText() {
    const speechApi = getSpeechApi()
    if (!speechApi) {
      setSpeechStatus(t('accessibility.communication.unsupported'))
      return
    }

    stopSpeaking()
    const utterance = new speechApi.Utterance(selectedText)
    utterance.lang = 'sv-SE'
    utterance.onend = () => {
      setIsSpeaking(false)
      setSpeechStatus(t('accessibility.communication.stopped'))
    }
    utterance.onerror = () => {
      setIsSpeaking(false)
      setSpeechStatus(t('accessibility.communication.stopped'))
    }
    speechApi.synthesis.speak(utterance)
    setIsSpeaking(true)
    setSpeechStatus(t('accessibility.communication.speaking'))
  }

  function clearText() {
    stopSpeaking()
    setCustomText('')
    setLargeTextOpen(false)
    setSelectedPhrase('')
    setSpeechStatus('')
  }

  return (
    <section className="accessibility-communication" aria-label={t('accessibility.communication.label')}>
      <p className="accessibility-communication-privacy">{t('accessibility.communication.privacy')}</p>
      {phraseGroups.map((group) => (
        <section className="accessibility-phrase-group" aria-labelledby={`communication-${group.id}`} key={group.id}>
          <h3 id={`communication-${group.id}`}>{t(`accessibility.communication.groups.${group.id}`)}</h3>
          <div className="accessibility-phrase-grid">
            {group.phrases.map((phraseId) => {
              const phrase = t(`accessibility.communication.phrases.${phraseId}`)
              return (
                <button
                  aria-pressed={selectedPhrase === phrase}
                  className="accessibility-phrase-button"
                  key={phraseId}
                  type="button"
                  onClick={() => selectPhrase(phraseId)}
                >
                  {phrase}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <label className="accessibility-custom-text">
        <span>{t('accessibility.communication.customLabel')}</span>
        <textarea
          maxLength={280}
          onChange={updateCustomText}
          placeholder={t('accessibility.communication.customPlaceholder')}
          rows={3}
          value={customText}
        />
      </label>

      {selectedText && (
        <section className="accessibility-selected-phrase" aria-live="polite">
          <p className="eyebrow">{t('accessibility.communication.selectedLabel')}</p>
          <strong>{selectedText}</strong>
          <div className="accessibility-communication-actions">
            <button className="primary-button" type="button" onClick={speakSelectedText}>
              {t('accessibility.communication.speak')}
            </button>
            {isSpeaking && (
              <button className="secondary-button" type="button" onClick={stopSpeakingWithStatus}>
                {t('accessibility.communication.stop')}
              </button>
            )}
            <button className="secondary-button" type="button" onClick={() => setLargeTextOpen(true)}>
              {t('accessibility.communication.showLarge')}
            </button>
            <button className="secondary-button" type="button" onClick={clearText}>
              {t('accessibility.communication.clear')}
            </button>
          </div>
        </section>
      )}

      {speechStatus && <p className="accessibility-speech-status" role="status">{speechStatus}</p>}

      <article className="accessibility-planned-card">
        <h3>{t('accessibility.communication.writeToAi')}</h3>
        <p>{t('accessibility.communication.writeToAiNote')}</p>
      </article>
      <article className="accessibility-planned-card">
        <h3>{t('accessibility.communication.favorites')}</h3>
        <p>{t('accessibility.communication.favoritesNote')}</p>
      </article>

      {largeTextOpen && (
        <section className="accessibility-large-text" aria-label={t('accessibility.communication.largeLabel')}>
          <p>{selectedText}</p>
          <button className="primary-button" type="button" onClick={() => setLargeTextOpen(false)}>
            {t('accessibility.communication.closeLarge')}
          </button>
        </section>
      )}
    </section>
  )
}

export default AccessibilityCommunication
