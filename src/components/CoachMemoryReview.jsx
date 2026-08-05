import { useEffect, useMemo, useRef, useState } from 'react'
import {
  coachActionSizeOptions,
  coachFocusCategories,
  coachStyleOptions,
  forgetCoachMemoryItem,
  forgetDerivedCoachMemory,
  normalizeCoachMemory,
  updateCoachMemoryPreferences,
} from '../services/coachMemory/coachMemoryModel.js'
import { buildCoachMemory, mergeCoachMemoryIntoFeedback } from '../services/coachMemory/coachMemoryBuilder.js'
import { selectCoachMemoryContext } from '../services/coachMemory/coachContextSelector.js'

const focusLabels = {
  activity: 'Aktivitet',
  goals: 'Mål',
  nutrition: 'Nutrition',
  planning: 'Planering',
  recovery: 'Återhämtning',
  reminders: 'Reminders',
  weight: 'Vikt',
}

function labelFor(category) {
  return focusLabels[category] || category
}

function MemoryItemList({ emptyText, items, onForget }) {
  if (!items.length) return <p>{emptyText}</p>
  return (
    <ul className="health-dashboard-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{labelFor(item.category)}</strong>
          <span>{item.evidenceCount} säkra signaler · confidence {Math.round(item.confidence * 100)}%</span>
          <small>Källa: {item.source === 'derived' ? 'härledd observation' : 'uttrycklig preferens'}</small>
          <button type="button" onClick={() => onForget(item.id)}>Glöm</button>
        </li>
      ))}
    </ul>
  )
}

export default function CoachMemoryReview({
  adaptiveCoachFeedback = {},
  analysisDate = '',
  context = {},
  onClose,
  onFeedbackChange,
}) {
  const headingRef = useRef(null)
  const [message, setMessage] = useState('')
  const now = analysisDate ? `${analysisDate}T12:00:00.000Z` : new Date().toISOString()
  const derivedMemory = useMemo(() => buildCoachMemory({
    ...context,
    adaptiveCoachFeedback,
  }, { analysisDate, now }), [adaptiveCoachFeedback, analysisDate, context, now])
  const memory = normalizeCoachMemory(adaptiveCoachFeedback.coachMemory || derivedMemory, { now })
  const selectedContext = selectCoachMemoryContext(memory, { now })

  useEffect(() => {
    headingRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function commit(nextMemory, status = 'Coachminnet uppdaterades.') {
    onFeedbackChange?.(mergeCoachMemoryIntoFeedback(adaptiveCoachFeedback, nextMemory, { now }))
    setMessage(status)
  }

  function updatePreference(patch) {
    commit(updateCoachMemoryPreferences(memory, patch, { now }))
  }

  function toggleFocus(category, field) {
    const current = memory.preferences[field]
    const next = current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category].filter((item, index, list) => list.indexOf(item) === index)
    updatePreference({ [field]: next })
  }

  function togglePersonalization(enabled) {
    commit({
      ...memory,
      consent: {
        ...memory.consent,
        memoryReviewedAt: now,
        personalizationEnabled: enabled,
        remoteAiMemoryEnabled: enabled ? memory.consent.remoteAiMemoryEnabled : false,
      },
    }, enabled ? 'Personlig anpassning är på.' : 'Personlig anpassning är av.')
  }

  function toggleRemoteMemory(enabled) {
    commit({
      ...memory,
      consent: {
        ...memory.consent,
        memoryReviewedAt: now,
        remoteAiMemoryEnabled: enabled && memory.consent.personalizationEnabled,
      },
    }, enabled ? 'Remote memory context är på.' : 'Remote memory context är av.')
  }

  function forgetAllDerived() {
    if (!window.confirm('Vill du glömma alla härledda coachminnen? Preferenser behålls.')) return
    commit(forgetDerivedCoachMemory(memory, { now }), 'Härledda coachminnen glömdes.')
  }

  return (
    <section className="report-v3-card" aria-labelledby="coach-memory-review-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Coachminne</p>
          <h3 id="coach-memory-review-heading" ref={headingRef} tabIndex={-1}>Vad coachen kommer ihåg</h3>
          <span>{memory.adaptationMetadata.generatedAt.slice(0, 10)} · {selectedContext.summary || 'Ingen aktiv memory context'}</span>
        </div>
        <button type="button" onClick={onClose}>Stäng</button>
      </div>

      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}

      <div className="health-dashboard-metrics">
        <span>Personlig anpassning: {memory.consent.personalizationEnabled ? 'På' : 'Av'}</span>
        <span>Remote memory: {memory.consent.remoteAiMemoryEnabled ? 'På' : 'Av'}</span>
        <span>Aktiva minnen: {memory.successfulStrategies.length + memory.declinedStrategies.length + memory.recurringBarriers.length}</span>
        <span>Coverage: {Math.round(memory.recentContext.currentCoverage * 100)}%</span>
      </div>

      <div className="inline-edit-form">
        <label>
          <span>Coachton</span>
          <select value={memory.preferences.preferredCoachTone} onChange={(event) => updatePreference({ preferredCoachTone: event.target.value })}>
            {coachStyleOptions.map((style) => <option key={style} value={style}>{style}</option>)}
          </select>
        </label>
        <label>
          <span>Actionstorlek</span>
          <select value={memory.preferences.preferredActionSize} onChange={(event) => updatePreference({ preferredActionSize: event.target.value })}>
            {coachActionSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      <div className="report-v3-actions">
        <button type="button" className="secondary-button" onClick={() => togglePersonalization(!memory.consent.personalizationEnabled)}>
          {memory.consent.personalizationEnabled ? 'Stäng av personlig anpassning' : 'Slå på personlig anpassning'}
        </button>
        <button type="button" className="secondary-button" disabled={!memory.consent.personalizationEnabled} onClick={() => toggleRemoteMemory(!memory.consent.remoteAiMemoryEnabled)}>
          {memory.consent.remoteAiMemoryEnabled ? 'Stäng av remote memory' : 'Slå på remote memory'}
        </button>
        <button type="button" onClick={forgetAllDerived}>Glöm alla härledda minnen</button>
      </div>

      <article>
        <h4>Fokusområden</h4>
        <div className="report-v3-actions">
          {coachFocusCategories.map((category) => (
            <button
              key={category}
              aria-pressed={memory.preferences.preferredFocusAreas.includes(category)}
              type="button"
              onClick={() => toggleFocus(category, 'preferredFocusAreas')}
            >
              {labelFor(category)}
            </button>
          ))}
        </div>
      </article>

      <article>
        <h4>Exkludera fokus</h4>
        <div className="report-v3-actions">
          {coachFocusCategories.map((category) => (
            <button
              key={category}
              aria-pressed={memory.preferences.excludedFocusAreas.includes(category)}
              type="button"
              onClick={() => toggleFocus(category, 'excludedFocusAreas')}
            >
              {labelFor(category)}
            </button>
          ))}
        </div>
      </article>

      <article>
        <h4>Framgångsrika strategier</h4>
        <MemoryItemList emptyText="Inga verifierade strategier ännu." items={memory.successfulStrategies} onForget={(id) => commit(forgetCoachMemoryItem(memory, id, { now }))} />
      </article>
      <article>
        <h4>Strategier du ofta avstår från</h4>
        <MemoryItemList emptyText="Inga återkommande avböjda strategier ännu." items={memory.declinedStrategies} onForget={(id) => commit(forgetCoachMemoryItem(memory, id, { now }))} />
      </article>
      <article>
        <h4>Återkommande hinder</h4>
        <MemoryItemList emptyText="Inga återkommande hinder med tillräckligt underlag." items={memory.recurringBarriers} onForget={(id) => commit(forgetCoachMemoryItem(memory, id, { now }))} />
      </article>

      <article>
        <h4>Säker AI-context preview</h4>
        <p>{selectedContext.memoryEnabled ? selectedContext.summary : 'Personlig anpassning är avstängd.'}</p>
        <p className="estimate-note">Innehåller inte rå historik, e-post, user ID, auth/session, prompts, providerresponses eller bilder.</p>
      </article>
    </section>
  )
}
