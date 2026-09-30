import { FUTURE_COACH_CONTEXT_FIELDS } from '../sharedAi/domainContract.js'

export function projectCoachContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const data = {}
  for (const field of FUTURE_COACH_CONTEXT_FIELDS) {
    if (raw[field] == null) continue
    data[field] = raw[field]
  }
  return Object.keys(data).length ? data : null
}

export function createFixtureCoachContext(fixture) {
  const data = projectCoachContext(fixture)
  return () => data
}

export function contextHasField(context, field) {
  const value = context?.[field]
  if (value == null) return false
  if (field === 'weightTrend' && value.status === 'missing') return false
  if (field === 'protein' && value.status === 'missing') return false
  return true
}

export function selectCoachModelContext(question, context) {
  if (!context) return null
  const text = String(question || '')
  let fields = Object.keys(context)
  if (/protein/i.test(text) && !/vikt/i.test(text)) fields = ['protein', 'meals']
  else if (/\b(vikt|mål)\b/i.test(text) && !/protein/i.test(text)) fields = ['weightTrend', 'goal']
  else if (/måltid|åt jag/i.test(text)) fields = ['meals', 'protein', 'preferences']
  else if (/aktivitet|promenad|steg/i.test(text)) fields = ['activity']
  else if (/vana/i.test(text)) fields = ['habits', 'preferences']
  const picked = {}
  for (const field of fields) {
    if (context[field] != null) picked[field] = context[field]
  }
  return Object.keys(picked).length ? picked : null
}
