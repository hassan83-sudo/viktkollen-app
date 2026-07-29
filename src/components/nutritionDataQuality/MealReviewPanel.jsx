import { useMemo, useState } from 'react'

const filterOptions = [
  ['all', 'Alla'],
  ['clear', 'Tydligt underlag'],
  ['limited', 'Begränsat underlag'],
  ['manual', 'Manuellt korrigerade'],
  ['review', 'Behöver granskas'],
]

function matchesFilter(entry, filter) {
  const confidence = entry.confidence

  if (filter === 'clear') return confidence.level === 'high'
  if (filter === 'limited') return ['low', 'unknown'].includes(confidence.level)
  if (filter === 'manual') return confidence.manualFields.length > 0
  if (filter === 'review') return confidence.reviewRecommended
  return true
}

function MealReviewPanel({ entries, onEditMeal }) {
  const [filter, setFilter] = useState('review')
  const [ignoredIds, setIgnoredIds] = useState([])
  const [expandedIds, setExpandedIds] = useState([])
  const filtered = useMemo(
    () =>
      entries
        .filter((entry) => matchesFilter(entry, filter))
        .filter((entry) => !ignoredIds.includes(entry.id))
        .slice(0, 5),
    [entries, filter, ignoredIds],
  )

  function toggleExpanded(id) {
    setExpandedIds((current) => current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id])
  }

  return (
    <section className="nutrition-card meal-review-panel" aria-labelledby="meal-review-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Datakvalitet</p>
          <h3 id="meal-review-title">Måltider att granska</h3>
        </div>
        <span className="nutrition-pill" role="status">{filtered.length} visas</span>
      </div>
      <div className="segmented-control meal-review-filter" aria-label="Filtrera måltider efter underlag">
        {filterOptions.map(([value, label]) => (
          <button
            aria-pressed={filter === value}
            className={filter === value ? 'active' : ''}
            key={value}
            type="button"
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {!filtered.length ? (
        <div className="nutrition-empty">
          <strong>Inga måltider matchar filtret.</strong>
          <span>Registrerade måltider med tydligare underlag visas här.</span>
        </div>
      ) : (
        <div className="meal-review-list">
          {filtered.map((entry) => {
            const expanded = expandedIds.includes(entry.id)

            return (
              <article key={entry.id}>
                <div>
                  <span className="nutrition-pill">{entry.confidence.label}</span>
                  <h4>{entry.text || 'Måltid utan text'}</h4>
                  <small>{entry.date || 'Datum saknas'}{entry.time ? ` kl. ${entry.time}` : ''}</small>
                </div>
                <p>{entry.confidence.explanation}</p>
                <button
                  aria-expanded={expanded}
                  className="secondary-button"
                  type="button"
                  onClick={() => toggleExpanded(entry.id)}
                >
                  {expanded ? 'Dölj förklaring' : 'Visa tips'}
                </button>
                {expanded && (
                  <ul>
                    {(entry.confidence.improvementTips.length ? entry.confidence.improvementTips : ['Underlaget är en uppskattning, inte ett verifierat värde.']).map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                )}
                <div className="nutrition-actions">
                  <button aria-label={`Redigera ${entry.text || 'måltid'}`} className="secondary-button" type="button" onClick={() => onEditMeal(entry.meal)}>
                    Redigera
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setIgnoredIds((current) => [...current, entry.id])}>
                    Ignorera för tillfället
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default MealReviewPanel
