import { useMemo, useState } from 'react'
import {
  buildAiNutritionCoachInsights,
  buildMinimalInsightAiPayload,
} from '../services/aiNutritionInsights.js'

function confidenceLabel(value) {
  if (value === 'high') return 'Starkt underlag'
  if (value === 'medium') return 'Medelstarkt underlag'
  return 'Begränsat underlag'
}

function coverageLabel(value) {
  if (value === 'good') return 'Bra datatäckning'
  if (value === 'partial') return 'Delvis datatäckning'
  return 'Begränsad datatäckning'
}

function InsightCard({ insight, onAskCoach }) {
  const question = `Kan du hjälpa mig med detta: ${insight.title}? ${insight.summary}`

  return (
    <article className={`insight-card is-${insight.priority}`} tabIndex={0}>
      <div className="insight-card-heading">
        <span>{insight.category}</span>
        <strong>{confidenceLabel(insight.confidence)}</strong>
      </div>
      <h3>{insight.title}</h3>
      <p>{insight.summary}</p>
      <details>
        <summary>Varför visas detta?</summary>
        <p>{insight.explanation}</p>
        {insight.evidence.length > 0 && (
          <ul>
            {insight.evidence.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </details>
      {insight.action && (
        <div className="insight-action">
          <span>Nästa steg</span>
          <p>{insight.action}</p>
        </div>
      )}
      <button type="button" className="secondary-button" onClick={() => onAskCoach(question)}>
        Fråga coachen om detta
      </button>
    </article>
  )
}

function AINutritionInsights({
  analysisDate,
  checkIn,
  checkIns = [],
  meals = [],
  nutritionGoals = {},
  onCoachQuestion,
  profile = {},
  weights = [],
}) {
  const [draftQuestion, setDraftQuestion] = useState('')
  const report = useMemo(() => buildAiNutritionCoachInsights({
    analysisDate,
    checkIn,
    checkIns,
    meals,
    nutritionGoals,
    profile,
    weights,
  }, {
    analysisDate,
  }), [analysisDate, checkIn, checkIns, meals, nutritionGoals, profile, weights])
  const aiPayload = useMemo(() => buildMinimalInsightAiPayload(report), [report])

  function handleAskCoach(question) {
    setDraftQuestion(question)
  }

  function sendQuestion() {
    if (!draftQuestion.trim()) return
    onCoachQuestion?.(draftQuestion.trim(), {
      insightContext: aiPayload,
    })
  }

  return (
    <section className="panel ai-nutrition-insights" id="insikter" aria-labelledby="insights-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Nutrition Coach V2</p>
          <h2 id="insights-heading">Dina insikter</h2>
        </div>
        <span className="insight-coverage">{coverageLabel(report.dataCoverage.level)}</span>
      </div>

      <div className="insight-overview" aria-live="polite">
        <p>{report.overview.summary}</p>
        <dl>
          <div>
            <dt>Framsteg</dt>
            <dd>{report.overview.keyProgress}</dd>
          </div>
          <div>
            <dt>Fokus</dt>
            <dd>{report.overview.keyImprovement}</dd>
          </div>
          <div>
            <dt>Nästa steg</dt>
            <dd>{report.overview.nextStep}</dd>
          </div>
          <div>
            <dt>Analysdatum</dt>
            <dd>{report.analysisDate}</dd>
          </div>
        </dl>
      </div>

      {report.insights.length === 0 ? (
        <div className="empty-state">
          <h3>Mer data behövs</h3>
          <p>Registrera några måltider, vikter eller check-ins så kan coachen hitta tydligare mönster.</p>
        </div>
      ) : (
        <div className="insight-grid">
          {report.insights.map((insight) => (
            <InsightCard insight={insight} key={insight.id} onAskCoach={handleAskCoach} />
          ))}
        </div>
      )}

      {report.actionPlan.length > 0 && (
        <div className="insight-plan">
          <h3>Föreslagen åtgärdsplan</h3>
          <ol>
            {report.actionPlan.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.timeframe}</span>
                <p>{item.nextStep}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="coach-question-box">
        <label htmlFor="insight-coach-question">Fråga coachen</label>
        <textarea
          id="insight-coach-question"
          value={draftQuestion}
          onChange={(event) => setDraftQuestion(event.target.value)}
          placeholder="Välj en insikt eller skriv en egen fråga."
          rows={3}
        />
        <button type="button" className="primary-button" onClick={sendQuestion} disabled={!draftQuestion.trim()}>
          Skicka till coachen
        </button>
      </div>
    </section>
  )
}

export default AINutritionInsights
