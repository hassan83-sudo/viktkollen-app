export const healthJourneyModelVersion = 1

export const healthJourneyEventTypes = [
  'weightProgress',
  'mealQuality',
  'nutritionGap',
  'activityProgress',
  'checkInTrend',
  'goalStarted',
  'goalCompleted',
  'habitStarted',
  'habitMilestone',
  'coachRecommendation',
  'coachActionCompleted',
  'weeklyPlanCreated',
  'weeklyPlanCompleted',
  'achievementUnlocked',
  'predictionChanged',
  'opportunityDetected',
  'cautionSignal',
  'notificationOutcome',
  'importRestoreEvent',
  'syncRecoveryEvent',
]

export const healthJourneyCategories = [
  'weight',
  'nutrition',
  'activity',
  'habits',
  'coach',
  'motivation',
  'recovery',
  'dataQuality',
]

export const healthJourneyTones = ['positive', 'neutral', 'caution']

const sensitivePatterns = [
  /auth/i,
  /session/i,
  /token/i,
  /providerresponse/i,
  /prompt/i,
  /base64/i,
  /data:image/i,
  /localstorage/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 240) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeNumber(value, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function hashHealthJourneyText(value) {
  const text = safeText(value).toLocaleLowerCase('sv-SE')
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function isoDateTime(value, fallback) {
  const text = safeText(value)
  const date = text ? new Date(text) : new Date(fallback || Date.now())
  return Number.isNaN(date.getTime()) ? new Date(fallback || 0).toISOString() : date.toISOString()
}

export function maskHealthJourneyEntityId(value) {
  const text = safeText(value)
  if (!text) return null
  return `masked-${hashHealthJourneyText(text)}`
}

export function containsSensitiveHealthJourneyText(value) {
  const text = safeText(value, '', 2000)
  return sensitivePatterns.some((pattern) => pattern.test(text))
}

export function sanitizeHealthJourneyText(value, fallback = '', max = 240) {
  const text = safeText(value, fallback, max)
  if (!text) return fallback
  if (containsSensitiveHealthJourneyText(text)) return fallback || 'Detaljer döljs av integritetsskäl.'
  return text
}

export function createHealthJourneyEvent(event = {}) {
  const type = healthJourneyEventTypes.includes(event.type) ? event.type : 'cautionSignal'
  const category = healthJourneyCategories.includes(event.category) ? event.category : 'dataQuality'
  const tone = healthJourneyTones.includes(event.tone || event.status) ? (event.tone || event.status) : 'neutral'
  const occurredAt = isoDateTime(event.occurredAt, event.fallbackAt || new Date(0).toISOString())
  const source = sanitizeHealthJourneyText(event.source, 'healthJourney', 80)
  const title = sanitizeHealthJourneyText(event.title, 'Journey-händelse', 90)
  const summary = sanitizeHealthJourneyText(event.summary, 'Sammanfattning saknas.', 220)
  const explanation = sanitizeHealthJourneyText(event.explanation, 'Visas eftersom aggregerad appdata stödjer händelsen.', 360)
  const limitations = safeArray(event.limitations)
    .map((item) => sanitizeHealthJourneyText(item, '', 140))
    .filter(Boolean)
    .slice(0, 4)
  const id = safeText(event.id) || `journey-${type}-${hashHealthJourneyText([
    type,
    category,
    occurredAt,
    source,
    title,
    event.relatedEntityType,
    event.relatedEntityIdMasked || event.relatedEntityId,
  ].join('|'))}`

  return {
    category,
    confidence: Math.max(0, Math.min(100, safeNumber(event.confidence, 35))),
    dataCoverage: Math.max(0, Math.min(100, safeNumber(event.dataCoverage, 0))),
    derived: event.derived !== false,
    explanation,
    id,
    importance: Math.max(1, Math.min(100, safeNumber(event.importance, 40))),
    limitations,
    occurredAt,
    period: sanitizeHealthJourneyText(event.period, '', 40),
    relatedEntityIdMasked: event.relatedEntityIdMasked || maskHealthJourneyEntityId(event.relatedEntityId),
    relatedEntityType: sanitizeHealthJourneyText(event.relatedEntityType, '', 50) || null,
    source,
    summary,
    title,
    tone,
    type,
    userVisible: event.userVisible !== false,
  }
}

export function validateHealthJourneyEvent(event = {}) {
  const errors = []
  if (!event.id) errors.push('id saknas')
  if (!healthJourneyEventTypes.includes(event.type)) errors.push('ogiltig eventtyp')
  if (!healthJourneyCategories.includes(event.category)) errors.push('ogiltig kategori')
  if (!healthJourneyTones.includes(event.tone)) errors.push('ogiltig ton')
  if (Number.isNaN(new Date(event.occurredAt).getTime())) errors.push('ogiltigt datum')
  if (event.derived !== true) errors.push('journey-event ska vara härlett')
  if (event.userVisible !== true) errors.push('eventet är inte användarsynligt')
  if (containsSensitiveHealthJourneyText(JSON.stringify(event))) errors.push('känslig text upptäckt')
  return errors
}

export function explainHealthJourneyEvent(event = {}) {
  return {
    confidence: event.confidence ?? 0,
    dataCategories: [event.category, event.source].filter(Boolean),
    nextStep: event.tone === 'caution'
      ? 'Välj ett litet nästa steg och tolka signalen som stöd, inte som ett betyg.'
      : event.tone === 'positive'
        ? 'Fortsätt med samma rimliga bas innan du höjer kraven.'
        : 'Samla lite mer data eller öppna relaterad vy för mer sammanhang.',
    uncertainty: event.confidence >= 70
      ? 'Osäkerheten är lägre eftersom flera aggregerade signaler stödjer detta.'
      : event.confidence >= 45
        ? 'Osäkerheten är måttlig eftersom underlaget är delvis.'
        : 'Osäkerheten är hög eftersom underlaget är begränsat.',
    whatHappened: event.summary || 'En aggregerad händelse identifierades.',
    whyShown: event.explanation || 'Den visas eftersom flera säkra appsignaler pekar på samma tema.',
  }
}

export function makeHealthJourneyError(code = 'unknown') {
  const messages = {
    aiUnavailable: 'AI-förfining är inte tillgänglig just nu. Den regelbaserade sammanfattningen visas.',
    analyticsUnavailable: 'Analysen kunde inte byggas fullt ut. En säker fallback visas.',
    insufficientData: 'Mer data behövs innan resan kan sammanfattas tryggt.',
    invalidSource: 'En datakälla kunde inte användas säkert.',
    predictionUnavailable: 'Prognos saknas eller har för låg täckning.',
    safetyBlocked: 'Innehållet blockerades av säkerhetsskäl.',
    staleData: 'Datan verkar inte helt färsk.',
    unknown: 'Journey kunde inte byggas fullt ut.',
  }

  return {
    code: messages[code] ? code : 'unknown',
    message: messages[code] || messages.unknown,
  }
}
