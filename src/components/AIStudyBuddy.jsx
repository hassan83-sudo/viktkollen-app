import { useState } from 'react'

function makeFallbackHint(question, subject) {
  if (!question) {
    return 'Välj en fråga först, så kan jag ge en kort hint.'
  }

  return `Titta på nyckelorden i ${subject} och uteslut svar som inte passar. Försök hitta metoden innan du väljer alternativ.`
}

function AIStudyBuddy({ question, subject }) {
  const [hint, setHint] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function requestHint() {
    setError('')

    if (!question) {
      setHint(makeFallbackHint(question, subject))
      return
    }

    setIsLoading(true)
    setStatus('AI Study Buddy tänker...')

    try {
      const response = await fetch('/api/study-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: question.answer,
          options: question.options,
          question: question.question,
          subject,
        }),
      })

      if (!response.ok) {
        throw new Error(`Study Buddy API failed with status ${response.status}`)
      }

      const data = await response.json()

      if (typeof data.hint === 'string' && data.hint.trim()) {
        setHint(data.hint.trim())
        setStatus(data.source === 'openai' ? 'AI-genererad hint.' : 'Mockad fallback-hint.')
        setError(typeof data.message === 'string' ? data.message : '')
        return
      }

      throw new Error('Study Buddy API returned no hint')
    } catch (requestError) {
      setError('Kunde inte nå AI just nu. Visar fallback-hint.')
      setHint(makeFallbackHint(question, subject))
      setStatus(
        requestError instanceof Error
          ? requestError.message
          : 'Fallback används.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="panel buddy-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Coach</p>
          <h2>AI Study Buddy</h2>
        </div>
      </div>

      <div className="buddy-card">
        <span className="buddy-avatar">AI</span>
        <div>
          <strong>Behöver du en knuff?</strong>
          <p>
            {question
              ? `Få en kort pedagogisk hint i ${subject}.`
              : 'Starta quizet igen så kan Study Buddy hjälpa dig med nästa fråga.'}
          </p>
        </div>
      </div>

      <button
        className="hint-button"
        type="button"
        onClick={requestHint}
        disabled={isLoading}
      >
        {isLoading ? 'Hämtar hint...' : 'Få en hint'}
      </button>

      {(hint || error || status) && (
        <div className="hint-box">
          {error && <p className="hint-error">{error}</p>}
          {hint && <p>{hint}</p>}
          {status && <small>{status}</small>}
        </div>
      )}
    </section>
  )
}

export default AIStudyBuddy
