import { useEffect, useRef, useState } from 'react'
import {
  TEST_FEEDBACK_CATEGORIES,
  TEST_FEEDBACK_COMMENT_MAX,
  TEST_FEEDBACK_FEATURES,
  TEST_FEEDBACK_RATINGS,
} from './testFeedbackOptions.js'
import { submitTestFeedback } from './testFeedbackClient.js'
import './TestFeedback.css'

const ERROR_MESSAGES = {
  AUTH_REQUIRED: 'Du behöver vara inloggad för att skicka feedback.',
  AUTH_STALE: 'Du loggades ut eller bytte konto. Logga in och försök igen.',
  INVALID_REQUEST: 'Något i formuläret kunde inte tas emot. Kontrollera valen och försök igen.',
  RATE_LIMITED: 'Du har skickat många svar på kort tid. Vänta en stund och försök igen.',
  REQUEST_TOO_LARGE: 'Kommentaren är för lång. Korta ner den och försök igen.',
}
const FALLBACK_ERROR = 'Feedbacken kunde inte skickas just nu. Ditt svar finns kvar – försök igen om en stund.'

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() || ''
}

export default function TestFeedbackPage({ isAuthenticated = false }) {
  const [features, setFeatures] = useState([])
  const [category, setCategory] = useState('')
  const [rating, setRating] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [validation, setValidation] = useState('')
  // Samma request-ID vid omförsök av samma svar: servern sparar det bara en gång.
  const requestId = useRef('')
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const edited = () => {
    requestId.current = ''
    setSuccess('')
    setValidation('')
  }

  const toggleFeature = (id) => {
    edited()
    setFeatures((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current) return
    setError('')
    setSuccess('')
    if (!features.length) {
      setValidation('Välj minst en funktion som du har testat.')
      return
    }
    if (!category) {
      setValidation('Välj vilken typ av synpunkt det gäller.')
      return
    }
    setValidation('')
    inFlight.current = true
    setBusy(true)
    requestId.current ||= newRequestId()
    try {
      const result = await submitTestFeedback({
        appVersion: String(import.meta.env.VITE_APP_VERSION || ''),
        category,
        comment: comment.trim(),
        features,
        rating: rating || null,
        requestId: requestId.current,
      })
      if (!mounted.current) return
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.code] || FALLBACK_ERROR)
        return
      }
      // Rensas först när servern bekräftat att svaret sparats.
      setFeatures([])
      setCategory('')
      setRating('')
      setComment('')
      requestId.current = ''
      setSuccess('Tack! Din feedback är sparad och går direkt till Viktkollen-teamet.')
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <article className="panel test-feedback" id="testa-viktkollen" aria-labelledby="test-feedback-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Inför lanseringen</p>
          <h2 id="test-feedback-title">Testa Viktkollen</h2>
        </div>
      </div>
      <p className="test-feedback-intro">
        Berätta vad som fungerar och vad som behöver bli bättre. Skriv inga personnummer, lösenord eller
        hälsouppgifter i kommentaren. Bilder skickas inte med.
      </p>

      {!isAuthenticated ? (
        <p className="form-error" role="status">Logga in för att kunna skicka feedback.</p>
      ) : (
        <form className="test-feedback-form" onSubmit={handleSubmit} noValidate>
          <fieldset className="test-feedback-group">
            <legend>Vilka funktioner har du testat? <span className="test-feedback-hint">Välj en eller flera</span></legend>
            <div className="test-feedback-chips">
              {TEST_FEEDBACK_FEATURES.map((feature) => (
                <label key={feature.id} className={`test-feedback-chip${features.includes(feature.id) ? ' is-selected' : ''}`}>
                  <input
                    checked={features.includes(feature.id)}
                    disabled={busy}
                    name="features"
                    onChange={() => toggleFeature(feature.id)}
                    type="checkbox"
                    value={feature.id}
                  />
                  <span>{feature.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="test-feedback-group">
            <legend>Vad gäller det?</legend>
            <div className="test-feedback-chips">
              {TEST_FEEDBACK_CATEGORIES.map((item) => (
                <label key={item.id} className={`test-feedback-chip${category === item.id ? ' is-selected' : ''}`}>
                  <input
                    checked={category === item.id}
                    disabled={busy}
                    name="category"
                    onChange={() => { edited(); setCategory(item.id) }}
                    type="radio"
                    value={item.id}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="test-feedback-group">
            <legend>Hur fungerar det? <span className="test-feedback-hint">Frivilligt</span></legend>
            <div className="test-feedback-chips is-rating">
              {TEST_FEEDBACK_RATINGS.map((item) => (
                <label key={item.id} className={`test-feedback-chip${rating === item.id ? ' is-selected' : ''}`}>
                  <input
                    checked={rating === item.id}
                    disabled={busy}
                    name="rating"
                    onChange={() => { edited(); setRating(item.id) }}
                    type="radio"
                    value={item.id}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            {rating && (
              <button className="test-feedback-clear" disabled={busy} type="button" onClick={() => { edited(); setRating('') }}>
                Ta bort bedömning
              </button>
            )}
          </fieldset>

          <div className="test-feedback-group test-feedback-comment">
            <label htmlFor="test-feedback-comment">Vad fungerar dåligt eller vad vill du förbättra?</label>
            <textarea
              aria-describedby="test-feedback-comment-count"
              id="test-feedback-comment"
              disabled={busy}
              maxLength={TEST_FEEDBACK_COMMENT_MAX}
              onChange={(event) => { edited(); setComment(event.target.value) }}
              placeholder="Beskriv gärna vad du gjorde, vad som hände och vad du hade väntat dig. Flera synpunkter går bra."
              rows={6}
              value={comment}
            />
            <small id="test-feedback-comment-count">{comment.length} / {TEST_FEEDBACK_COMMENT_MAX}</small>
          </div>

          {validation && <p className="form-error" role="alert">{validation}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <p aria-live="polite" className={success ? 'form-success' : 'sr-only'} role="status">{success}</p>

          <button className="primary-button test-feedback-submit" disabled={busy} type="submit" aria-busy={busy}>
            {busy ? 'Skickar…' : 'Skicka feedback'}
          </button>
        </form>
      )}
    </article>
  )
}
