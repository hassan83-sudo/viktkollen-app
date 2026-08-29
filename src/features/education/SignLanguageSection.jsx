import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getReadyAvatar } from '../ready/readyAvatars.js'
import {
  loadCompanionProfile,
  saveCompanionProfile,
} from '../companion/companionModel.js'
import { createCameraSession } from '../shared/camera/cameraSession.js'
import {
  getSignLanguageCapabilityState,
  signLanguageOptions,
  signPhraseSeeds,
} from './learningMediaModel.js'

const learnCategories = [
  'greetings',
  'family',
  'school',
  'food',
  'feelings',
  'body',
  'everyday',
  'numbersTime',
  'helpSafety',
]

function SignLanguageSection({ onOpenAiCoach }) {
  const { t } = useTranslation(['education', 'ready', 'common'])
  const [profile, setProfile] = useState(() => loadCompanionProfile())
  const [question, setQuestion] = useState('')
  const [answerRequested, setAnswerRequested] = useState(false)
  const [mirrorConsent, setMirrorConsent] = useState(false)
  const [mirrorStatus, setMirrorStatus] = useState('')
  const [mirrorActive, setMirrorActive] = useState(false)
  const videoRef = useRef(null)
  const cameraSessionRef = useRef(null)
  const avatar = getReadyAvatar(profile.avatarId)
  const capabilities = getSignLanguageCapabilityState()

  const capabilityRows = Object.entries(capabilities)

  useEffect(() => () => {
    cameraSessionRef.current?.stop()
  }, [])

  function patchProfile(patch) {
    setProfile((current) => {
      const next = saveCompanionProfile({ ...current, ...patch })
      return next
    })
  }

  async function startMirror() {
    if (!mirrorConsent) {
      setMirrorStatus(t('signLanguage.practice.consentRequired'))
      return
    }

    if (!cameraSessionRef.current) {
      cameraSessionRef.current = createCameraSession({ facingMode: 'user' })
    }

    const result = await cameraSessionRef.current.start(videoRef.current)
    setMirrorActive(result.ok)
    setMirrorStatus(result.ok ? t('signLanguage.practice.active') : result.message || t('signLanguage.practice.unavailable'))
  }

  function stopMirror() {
    cameraSessionRef.current?.stop()
    setMirrorActive(false)
    setMirrorStatus(t('signLanguage.practice.stopped'))
  }

  function resetCommunication() {
    patchProfile({
      communicationPreference: 'text',
      prefersSpeech: false,
      selectedSignLanguage: 'sts',
    })
  }

  function submitQuestion(event) {
    event.preventDefault()
    setAnswerRequested(Boolean(question.trim()))
  }

  return (
    <div className="education-center sign-language-center" id="sign-language">
      <header className="education-hero">
        <p className="eyebrow">{t('education:signLanguage.eyebrow')}</p>
        <h1>{t('education:signLanguage.title')}</h1>
        <p>{t('education:signLanguage.subtitle')}</p>
      </header>

      <nav className="education-entry-grid" aria-label={t('education:signLanguage.entriesAria')}>
        {['talk', 'learn', 'phrases', 'practice'].map((entry) => (
          <a href={`#sign-language-${entry}`} key={entry}>{t(`education:signLanguage.entries.${entry}`)}</a>
        ))}
      </nav>

      <section className="education-panel" id="sign-language-talk" aria-labelledby="sign-language-talk-title">
        <div className="education-panel-heading">
          <div>
            <p className="eyebrow">{t('education:signLanguage.talk.aiEyebrow')}</p>
            <h2 id="sign-language-talk-title">{t('education:signLanguage.talk.title')}</h2>
          </div>
          <span className={`ready-avatar-button is-${avatar.accent}`} aria-label={t('ready:avatar.pick')}>
            {t(`ready:${avatar.labelKey}`)}
          </span>
        </div>
        <p>{t('education:signLanguage.talk.limits')}</p>
        <div className="education-form-grid">
          <label>
            {t('education:signLanguage.settings.signLanguage')}
            <select value={profile.selectedSignLanguage} onChange={(event) => patchProfile({ selectedSignLanguage: event.target.value })}>
              {signLanguageOptions.map((language) => (
                <option value={language.id} key={language.id}>
                  {t(`education:${language.labelKey}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('education:signLanguage.settings.preference')}
            <select value={profile.communicationPreference} onChange={(event) => patchProfile({ communicationPreference: event.target.value })}>
              <option value="text">{t('education:signLanguage.settings.text')}</option>
              <option value="visual">{t('education:signLanguage.settings.visual')}</option>
              <option value="text-and-verified-sign">{t('education:signLanguage.settings.textVerified')}</option>
            </select>
          </label>
          <label className="education-check-row">
            <input type="checkbox" checked={profile.prefersSpeech} onChange={(event) => patchProfile({ prefersSpeech: event.target.checked })} />
            {t('education:signLanguage.settings.speech')}
          </label>
        </div>
        <form className="education-ai-box" onSubmit={submitQuestion}>
          <label>
            {t('education:signLanguage.talk.questionLabel')}
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows="3" />
          </label>
          <div className="education-actions">
            <button className="primary-button" type="submit">{t('education:signLanguage.talk.textAnswer')}</button>
            <button className="secondary-button" type="button" onClick={() => onOpenAiCoach?.()}>{t('education:signLanguage.talk.openCoach')}</button>
            <button className="secondary-button" type="button" onClick={resetCommunication}>{t('common:reset')}</button>
          </div>
        </form>
        <div className="education-preview" role="status">
          <h3>{t('education:signLanguage.talk.preview')}</h3>
          <p>{t('education:signLanguage.talk.noVerifiedVideo')}</p>
          {answerRequested && <p>{t('education:signLanguage.talk.textFallback')}</p>}
        </div>
        <ul className="education-capabilities" aria-label={t('education:signLanguage.talk.capabilities')}>
          {capabilityRows.map(([key, enabled]) => (
            <li key={key}>{t(`education:signLanguage.capabilities.${key}`)} · {enabled ? t('education:media.status.working') : t('education:media.status.future')}</li>
          ))}
        </ul>
        <p className="education-safety-note">{t('education:signLanguage.talk.interpreterLimit')}</p>
      </section>

      <section className="education-panel" id="sign-language-learn" aria-labelledby="sign-language-learn-title">
        <h2 id="sign-language-learn-title">{t('education:signLanguage.learn.title')}</h2>
        <div className="education-card-grid">
          {learnCategories.map((category, index) => (
            <article className="education-mini-card" key={category}>
              <h3>{t(`education:signLanguage.learn.categories.${category}`)}</h3>
              <p>{t(`education:signLanguage.learn.status.${index === 0 ? 'videoLater' : index === 1 ? 'needsReview' : 'planned'}`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="education-panel" id="sign-language-phrases" aria-labelledby="sign-language-phrases-title">
        <h2 id="sign-language-phrases-title">{t('education:signLanguage.phrasesTitle')}</h2>
        <ul className="education-list">
          {signPhraseSeeds.map((phrase) => (
            <li key={phrase.id}>
              <strong>{t(`education:${phrase.textKey}`)}</strong>
              <span>{t('education:signLanguage.phraseMeta', { language: 'STS', status: t('education:media.status.needsReview') })}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="education-panel" id="sign-language-practice" aria-labelledby="sign-language-practice-title">
        <h2 id="sign-language-practice-title">{t('education:signLanguage.practice.title')}</h2>
        <p>{t('education:signLanguage.practice.body')}</p>
        <label className="education-check-row">
          <input type="checkbox" checked={mirrorConsent} onChange={(event) => setMirrorConsent(event.target.checked)} />
          {t('education:signLanguage.practice.consent')}
        </label>
        <div className="education-camera-box">
          <video ref={videoRef} aria-label={t('education:signLanguage.practice.videoAria')} />
          <p>{mirrorStatus || t('education:signLanguage.practice.noRecording')}</p>
        </div>
        <div className="education-actions">
          <button className="secondary-button" type="button" onClick={startMirror}>{t('education:signLanguage.practice.start')}</button>
          <button className="secondary-button" type="button" onClick={stopMirror} disabled={!mirrorActive}>{t('education:signLanguage.practice.stop')}</button>
        </div>
      </section>
    </div>
  )
}

export default SignLanguageSection
