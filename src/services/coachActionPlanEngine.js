import { buildAdaptiveCoach } from './adaptiveCoachEngine.js'
import {
  mergeAdaptiveCoachActionPlan,
  normalizeAdaptiveCoachFeedback,
  updateAdaptiveCoachPlanActionStatus,
} from './adaptiveCoachFeedback.js'
import { buildAdaptiveCoachStrategy } from './adaptiveCoachStrategy.js'
import { buildCoachMemory } from './coachMemory/coachMemoryBuilder.js'
import { selectCoachMemoryContext } from './coachMemory/coachContextSelector.js'
import { buildInsightsEngine } from './insights/insightsEngine.js'
import { addLocalDays, getLocalDateString } from './localDate.js'
import { buildNotificationPlan } from './notifications/notificationEngine.js'
import { normalizeReminderState } from './reminders/reminderModel.js'

export const coachActionPlanVersion = 1
export const coachActionPlanDayParts = ['morning', 'afternoon', 'evening']

const dayPartLabels = {
  afternoon: 'Eftermiddag',
  evening: 'Kväll',
  morning: 'Morgon',
}

const safeFallbackActions = [
  {
    category: 'nutrition',
    description: 'Lägg till en enkel proteinkälla vid nästa måltid om det passar dagen.',
    title: 'Protein i nästa måltid',
  },
  {
    category: 'activity',
    description: 'Ta en kort promenad eller dela upp rörelsen i ett litet block.',
    title: 'Kort rörelseblock',
  },
  {
    category: 'goals',
    description: 'Gör en snabb check-in och välj ett litet steg för resten av dagen.',
    title: 'Liten check-in',
  },
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 220) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function hashText(value) {
  const text = safeText(value).toLocaleLowerCase('sv-SE')
  let hash = 2166136261

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function startOfWeek(dateText) {
  const date = new Date(`${getLocalDateString(dateText || new Date())}T12:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)

  return getLocalDateString(date)
}

function timeIsInQuietHours(time, quietHours = {}) {
  if (quietHours.enabled === false) return false
  const [hours, minutes] = String(time || '09:00').split(':').map(Number)
  const [startHours, startMinutes] = String(quietHours.start || '22:00').split(':').map(Number)
  const [endHours, endMinutes] = String(quietHours.end || '07:00').split(':').map(Number)
  const current = hours * 60 + minutes
  const start = startHours * 60 + startMinutes
  const end = endHours * 60 + endMinutes
  if (![current, start, end].every(Number.isFinite) || start === end) return false
  if (start < end) return current >= start && current < end
  return current >= start || current < end
}

function reminderTimeFor(dayPart, quietHours = {}) {
  const candidates = {
    afternoon: ['14:30', '15:30', '13:30'],
    evening: ['19:00', '18:30', '20:00'],
    morning: ['08:30', '09:00', '10:00'],
  }[dayPart] || ['09:00']

  return candidates.find((time) => !timeIsInQuietHours(time, quietHours)) || ''
}

function latestPlan(feedback) {
  return safeArray(feedback.actionPlans)
    .slice()
    .sort((first, second) => String(second.generatedAt).localeCompare(String(first.generatedAt)))[0] || null
}

function buildAdaptation(feedback) {
  const planActions = safeArray(feedback.actionPlans).flatMap((plan) => safeArray(plan.days).flatMap((day) => safeArray(day.actions)))
  const recent = planActions.slice(-21)
  const completed = recent.filter((action) => action.status === 'completed').length
  const skipped = recent.filter((action) => action.status === 'skipped').length
  const total = completed + skipped
  const completionRate = total ? completed / total : null
  const skippedRate = total ? skipped / total : null
  const repeatedSkips = skipped >= 3 || skippedRate >= 0.5
  const strongSuccess = completed >= 5 && completionRate >= 0.75
  const level = repeatedSkips ? 'easier' : strongSuccess ? 'harder' : 'balanced'
  const baseDuration = level === 'easier' ? 6 : level === 'harder' ? 16 : 10

  return {
    baseDuration,
    completed,
    completionRate,
    level,
    skipped,
    text: repeatedSkips
      ? 'Planen kortades ned eftersom flera steg hoppats över nyligen.'
      : strongSuccess
        ? 'Planen höjdes försiktigt eftersom flera steg markerats som klara.'
        : 'Planen hålls på en lugn och realistisk nivå.',
  }
}

function recommendationPool(input, options) {
  const analysisDate = options.analysisDate
  const now = options.now
  const coachModel = input.coachModel || buildAdaptiveCoach(input, { analysisDate, now, period: '30d' })
  const insights = input.insights || buildInsightsEngine(input, { analysisDate, now, period: '90d' })
  const memory = input.coachMemory || input.adaptiveCoachFeedback?.coachMemory || buildCoachMemory(input, { analysisDate, now })
  const memoryContext = selectCoachMemoryContext(memory, {
    intents: ['goals', 'nutrition', 'activity', 'weight'],
    now,
  })
  const strategy = buildAdaptiveCoachStrategy({
    ...input,
    coachMemory: memory,
    coachModel,
  }, { analysisDate, now })
  const candidates = [
    ...safeArray(coachModel.recommendations).map((item) => ({
      category: item.area,
      description: item.action,
      reason: item.text,
      source: 'adaptiveCoach',
      title: item.title,
      priority: item.adjustedPriority || item.priority || 55,
    })),
    ...safeArray(strategy.recommendations).map((item) => ({
      category: item.category,
      description: item.action,
      reason: item.reason,
      source: 'adaptiveCoachStrategy',
      title: item.title,
      priority: item.priorityBoost ? 64 + item.priorityBoost : 52,
    })),
    ...safeArray(insights.improvementSignals).map((item) => ({
      category: item.category || 'goals',
      description: item.text,
      reason: item.title,
      source: 'insights',
      title: item.title,
      priority: 50,
    })),
    ...safeFallbackActions.map((item) => ({ ...item, priority: 35, reason: 'Säker fallback', source: 'fallback' })),
  ]
  const selectedFocus = new Set(memoryContext.selectedFocus || [])
  const excludedFocus = new Set(memoryContext.excludedFocus || [])
  const unique = []
  const seen = new Set()

  for (const candidate of candidates) {
    const category = safeText(candidate.category, 'goals').toLocaleLowerCase('sv-SE')
    if (excludedFocus.has(category)) continue
    const key = `${category}|${candidate.title}|${candidate.description}`.toLocaleLowerCase('sv-SE')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({
      ...candidate,
      category,
      priority: clamp(Number(candidate.priority || 40) + (selectedFocus.has(category) ? 8 : 0), 1, 100),
    })
  }

  return {
    coachModel,
    insights,
    memoryContext,
    recommendations: unique.sort((first, second) => second.priority - first.priority).slice(0, 8),
    strategy,
  }
}

function createAction({ adaptation, date, dayIndex, dayPart, index, item, quietHours, weekStart }) {
  const duration = clamp(adaptation.baseDuration + (dayPart === 'evening' ? -2 : 0) + (index % 2 === 0 ? 0 : 2), 4, 24)
  const reminderTime = reminderTimeFor(dayPart, quietHours)
  const id = `coach-plan-action-${hashText(`${weekStart}|${date}|${dayPart}|${item.category}|${item.title}|${index}`)}`

  return {
    category: item.category,
    dayPart,
    description: safeText(adaptation.level === 'easier'
      ? `Gör detta som en extra liten version: ${item.description}`
      : adaptation.level === 'harder'
        ? `${item.description} Lägg till ett litet extra steg bara om det känns rimligt.`
        : item.description, 'Ett litet nästa steg.'),
    durationMinutes: duration,
    id,
    optionalReminder: reminderTime
      ? {
        enabled: dayIndex < 5,
        time: reminderTime,
        title: item.title,
      }
      : null,
    priority: clamp(item.priority - dayIndex * 2, 1, 100),
    reason: safeText(item.reason || 'Vald från coachens aktuella underlag.'),
    status: 'pending',
    title: safeText(item.title, `${dayPartLabels[dayPart]}splan`),
  }
}

export function buildCoachActionPlan(input = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || input.analysisDate || input.today || new Date())
  const weekStart = startOfWeek(analysisDate)
  const weekEnd = getLocalDateString(addLocalDays(weekStart, 6))
  const now = options.now || `${analysisDate}T12:00:00.000Z`
  const feedback = normalizeAdaptiveCoachFeedback(input.adaptiveCoachFeedback || {}, { now })
  const reminderState = normalizeReminderState(input.reminderState || {}, { now })
  const notificationPlan = buildNotificationPlan({ reminderState }, { now })
  const quietHours = notificationPlan.settings.quietHours
  const adaptation = buildAdaptation(feedback)
  const pool = recommendationPool({ ...input, adaptiveCoachFeedback: feedback }, { analysisDate, now })
  const days = Array.from({ length: 7 }, (_, dayIndex) => {
    const date = getLocalDateString(addLocalDays(weekStart, dayIndex))
    const actions = coachActionPlanDayParts.map((dayPart, partIndex) => {
      const item = pool.recommendations[(dayIndex + partIndex) % pool.recommendations.length] || safeFallbackActions[partIndex]
      return createAction({ adaptation, date, dayIndex, dayPart, index: dayIndex + partIndex, item, quietHours, weekStart })
    })

    return {
      actions,
      date,
      label: dayIndex === 0 ? 'Måndag' : dayIndex === 1 ? 'Tisdag' : dayIndex === 2 ? 'Onsdag' : dayIndex === 3 ? 'Torsdag' : dayIndex === 4 ? 'Fredag' : dayIndex === 5 ? 'Lördag' : 'Söndag',
    }
  })
  const plan = {
    adaptiveChange: adaptation.text,
    confidence: clamp((pool.coachModel.confidence?.value || 0.35) + (pool.memoryContext.enabled ? 0.05 : 0), 0.2, 0.95),
    generatedAt: now,
    id: `coach-action-plan-${hashText(`${weekStart}|${pool.coachModel.confidence?.value}|${adaptation.level}`)}`,
    rationale: [
      pool.coachModel.summary?.todayFocus,
      pool.strategy.explanation,
      pool.insights.insights?.[0]?.text,
      adaptation.text,
    ].map((entry) => safeText(entry)).filter(Boolean).slice(0, 4),
    safetyNote: 'Planen är frivillig, lågintensiv och ska inte ersätta vård eller medicinska råd.',
    sourceStatus: 'ruleBased',
    updatedAt: now,
    version: coachActionPlanVersion,
    weekEnd,
    weekStart,
    days,
  }

  return {
    adaptation,
    completedActions: days.flatMap((day) => day.actions).filter((action) => action.status === 'completed'),
    confidenceScore: Math.round(plan.confidence * 100),
    latestStoredPlan: latestPlan(feedback),
    plan,
    remoteAiEligible: input.adaptiveCoachFeedback?.remoteAiConsent?.coachRemoteEnabled === true &&
      input.adaptiveCoachFeedback?.coachMemory?.consent?.remoteAiMemoryEnabled === true,
    skippedActions: days.flatMap((day) => day.actions).filter((action) => action.status === 'skipped'),
  }
}

export function saveCoachActionPlan(feedback, plan, options = {}) {
  return mergeAdaptiveCoachActionPlan(feedback, plan, options)
}

export function setCoachActionPlanActionStatus(feedback, planId, actionId, status, options = {}) {
  return updateAdaptiveCoachPlanActionStatus(feedback, planId, actionId, status, options)
}

export function buildCoachPlanCenterModel(input = {}, options = {}) {
  const built = buildCoachActionPlan(input, options)
  const feedback = normalizeAdaptiveCoachFeedback(input.adaptiveCoachFeedback || {}, {
    now: options.now || built.plan.generatedAt,
  })
  const storedPlan = latestPlan(feedback) || built.plan
  const today = getLocalDateString(options.analysisDate || input.analysisDate || input.today || built.plan.weekStart)
  const allActions = safeArray(storedPlan.days).flatMap((day) => safeArray(day.actions).map((action) => ({ ...action, date: day.date, dayLabel: day.label })))

  return {
    adaptiveChanges: storedPlan.adaptiveChange || built.adaptation.text,
    completedActions: allActions.filter((action) => action.status === 'completed'),
    confidenceScore: Math.round(clamp(storedPlan.confidence, 0, 1) * 100),
    explanation: safeArray(storedPlan.rationale),
    plan: storedPlan,
    skippedActions: allActions.filter((action) => action.status === 'skipped'),
    todayPlan: storedPlan.days.find((day) => day.date === today) || storedPlan.days[0] || null,
    weekPlan: storedPlan.days,
  }
}
