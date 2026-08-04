const allowedCategories = ['weight', 'nutrition', 'activity', 'goals', 'reminders', 'recovery', 'planning']
const allowedActionTypes = ['goal', 'habit', 'reminder', 'weeklyFocus', 'none']
const allowedSafetyCategories = ['standard', 'needs_review']

function safeText(value, fallback = '', max = 320) {
  return String(value || fallback)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

export function normalizeCoachAiResponse(value = {}, context = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const recommendations = safeArray(source.recommendations)
    .slice(0, 3)
    .map((item, index) => {
      const category = allowedCategories.includes(item?.category) ? item.category : 'planning'
      const suggestedActionType = allowedActionTypes.includes(item?.suggestedActionType) ? item.suggestedActionType : 'none'
      return {
        category,
        confidence: clamp(item?.confidence, 0, 1),
        description: safeText(item?.description, '', 360),
        id: safeText(item?.id, `ai-rec-${index + 1}`, 80),
        priority: clamp(item?.priority, 1, 100),
        reason: safeText(item?.reason, '', 240),
        requiresConfirmation: item?.requiresConfirmation !== false,
        safetyCategory: allowedSafetyCategories.includes(item?.safetyCategory) ? item.safetyCategory : 'needs_review',
        sourceFacts: safeArray(item?.sourceFacts).map((entry) => safeText(entry, '', 120)).filter(Boolean).slice(0, 4),
        suggestedActionType,
        title: safeText(item?.title, '', 90),
      }
    })
    .filter((item) => item.title && item.description && item.reason)

  return {
    confidence: clamp(source.confidence, 0, 1),
    dataUsed: safeArray(source.dataUsed).map((entry) => safeText(entry, '', 80)).filter(Boolean).slice(0, 8),
    generatedAt: safeText(source.generatedAt) || context.generatedAt || new Date().toISOString(),
    limitations: safeArray(source.limitations).map((entry) => safeText(entry, '', 160)).filter(Boolean).slice(0, 5),
    providerType: 'openai',
    rationale: safeText(source.rationale, '', 360),
    recommendations,
    requestId: safeText(source.requestId || context.requestId, '', 120),
    safetyNote: safeText(source.safetyNote, 'AI-forslag ar inte medicinska rad och ska granskas av anvandaren.', 220),
    summary: safeText(source.summary, '', 280),
  }
}

export function validateCoachAiResponse(value = {}) {
  const errors = []
  if (!value.summary) errors.push('summary')
  if (!Array.isArray(value.recommendations)) errors.push('recommendations')
  if (Array.isArray(value.recommendations) && value.recommendations.length > 3) errors.push('recommendations.max')
  ;(value.recommendations || []).forEach((item, index) => {
    if (!item.title) errors.push(`recommendations.${index}.title`)
    if (!item.description) errors.push(`recommendations.${index}.description`)
    if (!allowedCategories.includes(item.category)) errors.push(`recommendations.${index}.category`)
    if (!allowedActionTypes.includes(item.suggestedActionType)) errors.push(`recommendations.${index}.suggestedActionType`)
  })

  return {
    errors,
    ok: errors.length === 0,
  }
}

export const coachResponseSchemaInternals = {
  allowedActionTypes,
  allowedCategories,
  safeText,
}
