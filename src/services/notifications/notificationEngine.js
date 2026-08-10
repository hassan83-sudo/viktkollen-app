import { getNotificationPermission } from '../reminders/reminderNotifications.js'
import { normalizeReminderState } from '../reminders/reminderModel.js'
import { getNextReminderAt } from '../reminders/reminderScheduler.js'
import { buildAchievementEngine } from '../achievements/achievementEngine.js'
import { getEntryLocalDate, getLocalDateString, addLocalDays } from '../localDate.js'
import { buildDailyMealPlannerSaveState } from '../nutrition/dailyMealPlanner.js'
import { buildNutritionCoachModel } from '../nutrition/nutritionCoachEngine.js'
import { summarizeDay } from '../nutritionService.js'
import { buildHealthPredictionModel } from '../prediction/healthPredictionEngine.js'

export const notificationEngineVersion = 3
export const notificationHistoryLimit = 120

const defaultQuietHours = {
  enabled: true,
  end: '07:00',
  start: '22:00',
}

const statusLabels = {
  batched: 'Samlad',
  completed: 'Klar',
  dismissed: 'Avfärdad',
  delivered: 'Skickad',
  postponed: 'Uppskjuten',
  scheduled: 'Planerad',
  skipped: 'Hoppad över',
  suppressed: 'Pausad',
}

const smartPriorityScores = {
  high: 86,
  low: 42,
  medium: 64,
}

const smartPriorityLabels = {
  high: 'High',
  low: 'Low',
  medium: 'Medium',
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 180) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeIso(value, fallback = '') {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function normalizeTime(value, fallback) {
  const text = String(value || '')
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback
}

function minutesFromTime(value) {
  const [hours, minutes] = normalizeTime(value, '00:00').split(':').map(Number)
  return hours * 60 + minutes
}

function minutesFromDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours() * 60 + date.getMinutes()
}

function addMinutesIso(value, minutes) {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() + minutes)
  return date.toISOString()
}

function addDaysIso(dateText, days) {
  return getLocalDateString(addLocalDays(dateText, days))
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

function maskEntityId(value) {
  const text = safeText(value, '', 120)
  if (!text) return ''
  return `ref-${hashText(text)}`
}

function historyId(entry) {
  return `notification-${hashText([
    entry.sourceType,
    entry.sourceIdMasked,
    entry.status,
    entry.at,
  ].join('|'))}`
}

export function normalizeNotificationSettings(value = {}) {
  const source = isObject(value) ? value : {}
  const quietHours = isObject(source.quietHours) ? source.quietHours : {}
  const batchingWindowMinutes = Number.isFinite(Number(source.batchingWindowMinutes))
    ? clamp(source.batchingWindowMinutes, 5, 120)
    : 30

  return {
    batchingWindowMinutes,
    enabled: source.enabled !== false,
    quietHours: {
      enabled: quietHours.enabled !== false,
      end: normalizeTime(quietHours.end, defaultQuietHours.end),
      start: normalizeTime(quietHours.start, defaultQuietHours.start),
    },
  }
}

export function normalizeNotificationHistoryEntry(entry = {}, options = {}) {
  const source = isObject(entry) ? entry : {}
  const at = safeIso(source.at || source.createdAt || source.updatedAt, options.now || new Date().toISOString())
  const status = Object.hasOwn(statusLabels, source.status) ? source.status : 'scheduled'
  const normalized = {
    at,
    batchId: safeText(source.batchId, '', 120),
    id: safeText(source.id, '', 120),
    notificationId: safeText(source.notificationId, '', 120),
    reason: safeText(source.reason, '', 220),
    sourceIdMasked: safeText(source.sourceIdMasked || maskEntityId(source.sourceId), '', 80),
    sourceType: safeText(source.sourceType, 'reminder', 50),
    status,
    statusLabel: statusLabels[status],
    title: sanitizeNotificationTitle(source.title),
  }

  return {
    ...normalized,
    id: normalized.id || historyId(normalized),
  }
}

export function normalizeNotificationsV3(value = {}, options = {}) {
  const source = isObject(value) ? value : {}

  return {
    history: safeArray(source.history)
      .map((entry) => normalizeNotificationHistoryEntry(entry, options))
      .slice(-notificationHistoryLimit),
    lastDeliveredAtBySource: isObject(source.lastDeliveredAtBySource)
      ? Object.fromEntries(Object.entries(source.lastDeliveredAtBySource).map(([key, date]) => [safeText(key, '', 120), safeIso(date)]).filter(([key, date]) => key && date))
      : {},
    settings: normalizeNotificationSettings(source.settings),
    version: notificationEngineVersion,
  }
}

export function sanitizeNotificationTitle(value) {
  const title = safeText(value, 'Viktkollen', 90)
  if (/(token|session|apikey|api key|base64|data:image|supabase)/i.test(title)) return 'Viktkollen'
  return title
}

export function isWithinQuietHours(dateValue, quietHours = defaultQuietHours) {
  const settings = {
    ...defaultQuietHours,
    ...(isObject(quietHours) ? quietHours : {}),
  }
  if (settings.enabled === false) return false
  const current = minutesFromDate(dateValue)
  const start = minutesFromTime(settings.start)
  const end = minutesFromTime(settings.end)

  if (start === end) return false
  if (start < end) return current >= start && current < end
  return current >= start || current < end
}

export function getQuietHoursResumeAt(dateValue, quietHours = defaultQuietHours) {
  const date = new Date(dateValue)
  const end = normalizeTime(quietHours.end, defaultQuietHours.end)
  const [hours, minutes] = end.split(':').map(Number)
  const resume = new Date(date)
  resume.setHours(hours, minutes, 0, 0)
  if (resume <= date) resume.setDate(resume.getDate() + 1)
  return resume.toISOString()
}

function recentHistory(state, sourceType, status, limit = 14) {
  const notifications = normalizeNotificationsV3(state.notificationsV3)
  return notifications.history
    .filter((entry) => entry.sourceType === sourceType && (!status || entry.status === status))
    .slice(-limit)
}

export function buildAdaptiveDeliveryProfile(reminderState = {}) {
  const normalized = normalizeReminderState(reminderState)
  const completed = recentHistory(normalized, 'reminder', 'completed').length + normalized.history.filter((entry) => entry.action === 'completed').slice(-14).length
  const dismissed = recentHistory(normalized, 'reminder', 'dismissed').length + normalized.history.filter((entry) => entry.action === 'skipped').slice(-14).length
  const postponed = recentHistory(normalized, 'reminder', 'postponed').length + normalized.history.filter((entry) => entry.action === 'snoozed').slice(-14).length
  const ignored = dismissed + postponed
  const total = Math.max(1, completed + ignored)
  const completionRate = completed / total
  const ignoreRate = ignored / total

  return {
    batchingWindowMinutes: ignoreRate >= 0.5 ? 60 : completionRate >= 0.65 ? 15 : 30,
    cadence: ignoreRate >= 0.5 ? 'reduced' : completionRate >= 0.65 ? 'responsive' : 'balanced',
    completionRate: Math.round(completionRate * 100),
    ignoreRate: Math.round(ignoreRate * 100),
    recommendedDelayMinutes: ignored >= completed + 2 ? 45 : 0,
  }
}

function createReminderCandidate(reminder, options = {}) {
  const scheduledAt = safeIso(options.scheduledAt || getNextReminderAt(reminder, options), options.now)
  return {
    body: 'Du har en frivillig påminnelse i Viktkollen.',
    id: `notification-${hashText(`reminder|${reminder.id}|${scheduledAt}`)}`,
    priority: reminder.type === 'check_in' || reminder.type === 'meal_log' ? 70 : 55,
    scheduledAt,
    sourceId: reminder.id,
    sourceIdMasked: maskEntityId(reminder.id),
    sourceType: 'reminder',
    tag: `viktkollen-reminder-${reminder.id}`,
    title: sanitizeNotificationTitle(reminder.title),
  }
}

function createCoachCandidates(feedback = {}, options = {}) {
  const recommendations = safeArray(feedback.recommendations)
    .filter((item) => ['accepted', 'postponed', 'new'].includes(item.status || 'new'))
    .slice(0, 2)
  return recommendations.map((item, index) => ({
    body: 'Ett litet nästa steg väntar i coachen.',
    id: `notification-${hashText(`coach|${item.id || item.recommendationId}|${options.now}|${index}`)}`,
    priority: item.status === 'accepted' ? 68 : 48,
    scheduledAt: options.now,
    sourceId: item.id || item.recommendationId,
    sourceIdMasked: maskEntityId(item.id || item.recommendationId),
    sourceType: 'coachAction',
    tag: `viktkollen-coach-${hashText(item.id || item.recommendationId || index)}`,
    title: sanitizeNotificationTitle(item.title || 'Coachens nästa steg'),
  }))
}

function createWeeklyPlanCandidates(weeklyPlan = {}, options = {}) {
  const actions = safeArray(weeklyPlan.proposedActions || weeklyPlan.scheduleSuggestions).slice(0, 1)
  return actions.map((item, index) => ({
    body: 'Veckoplanen har ett planerat fokus att följa upp.',
    id: `notification-${hashText(`weekly|${item.id || item.actionId}|${options.now}|${index}`)}`,
    priority: 45,
    scheduledAt: options.now,
    sourceId: item.id || item.actionId,
    sourceIdMasked: maskEntityId(item.id || item.actionId),
    sourceType: 'weeklyPlan',
    tag: `viktkollen-weekly-${hashText(item.id || item.actionId || index)}`,
    title: sanitizeNotificationTitle(item.title || 'Veckoplan'),
  }))
}

function createSyncCandidates(syncStatus = {}, options = {}) {
  if (!syncStatus?.conflicts?.length && syncStatus?.syncHealth !== 'failed') return []
  return [{
    body: 'Sync behöver din uppmärksamhet.',
    id: `notification-${hashText(`sync|${syncStatus.syncHealth}|${options.now}`)}`,
    priority: 80,
    scheduledAt: options.now,
    sourceId: syncStatus.statusCode || 'sync',
    sourceIdMasked: maskEntityId(syncStatus.statusCode || 'sync'),
    sourceType: 'sync',
    tag: 'viktkollen-sync-status',
    title: 'Sync behöver granskas',
  }]
}

function priorityMeta(priority = 'medium') {
  const level = Object.hasOwn(smartPriorityScores, priority) ? priority : 'medium'

  return {
    priority: smartPriorityScores[level],
    priorityLabel: smartPriorityLabels[level],
    priorityLevel: level,
  }
}

function createSmartCandidate(source = {}, options = {}) {
  const meta = priorityMeta(source.priorityLevel)
  const group = safeText(source.group || source.sourceType || 'smart', 'smart', 40)
  const sourceId = `smart-${group}`

  return {
    body: safeText(source.body, 'En smart rekommendation finns i Viktkollen.', 180),
    group,
    id: `notification-${hashText(`smart|${group}|${source.title}|${options.now}`)}`,
    scheduledAt: options.now,
    sourceId,
    sourceIdMasked: maskEntityId(sourceId),
    sourceType: 'smart',
    tag: `viktkollen-smart-${group}`,
    title: sanitizeNotificationTitle(source.title),
    ...meta,
  }
}

function getDateFromEntry(entry = {}) {
  return getEntryLocalDate(entry) || getLocalDateString(entry.date || entry.createdAt || entry.updatedAt || entry.timestamp)
}

function getTodayWeight(weights = [], today) {
  return safeArray(weights).find((entry) => getDateFromEntry(entry) === today)
}

function getLatestWeight(weights = []) {
  return safeArray(weights)
    .map((entry) => ({ ...entry, localDate: getDateFromEntry(entry) }))
    .filter((entry) => entry.localDate)
    .sort((first, second) => first.localDate.localeCompare(second.localDate, 'sv-SE'))
    .at(-1) || null
}

function daysBetween(first, second) {
  const firstDate = new Date(`${first}T12:00:00`)
  const secondDate = new Date(`${second}T12:00:00`)
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(secondDate.getTime())) return 0

  return Math.max(0, Math.round((secondDate - firstDate) / 86400000))
}

function getMealPlanSignal(input = {}, today) {
  const saveState = input.mealPlanner?.saveState || buildDailyMealPlannerSaveState({
    date: today,
    mealPlans: input.mealPlans,
    nutritionGoals: input.nutritionGoals,
  })
  const tomorrow = addDaysIso(today, 1)
  const tomorrowState = buildDailyMealPlannerSaveState({
    date: tomorrow,
    mealPlans: input.mealPlans,
    nutritionGoals: input.nutritionGoals,
  })

  return {
    saveState,
    tomorrowState,
  }
}

function getProteinSignal(input = {}, today) {
  const summary = summarizeDay(input.meals || input.healthSnapshot?.nutrition?.actualMeals || [], today, input.nutritionGoals)
  const protein = Number(summary.totals?.protein || 0)
  const goal = Number(summary.goals?.protein || input.nutritionGoals?.protein)
  const weekDates = Array.from({ length: 7 }, (_, index) => addDaysIso(today, -index))
  const missingDays = Number.isFinite(goal) && goal > 0
    ? weekDates.filter((date) => {
      const day = summarizeDay(input.meals || [], date, input.nutritionGoals)
      const dayProtein = Number(day.totals?.protein || 0)
      return day.meals?.length > 0 && dayProtein < goal
    }).length
    : 0

  return {
    goal,
    missingDays,
    protein,
    remaining: Number.isFinite(goal) ? Math.max(0, Math.round(goal - protein)) : null,
    ratio: Number.isFinite(goal) && goal > 0 ? protein / goal : 0,
  }
}

function getSmartHistorySuppressions(history = [], now) {
  const nowTime = new Date(now).getTime()
  const suppressed = new Set()

  safeArray(history).forEach((entry) => {
    if (entry.sourceType !== 'smart' || !entry.sourceIdMasked) return
    const reason = safeText(entry.reason, '', 220)
    const until = reason.startsWith('snooze_until:')
      ? safeIso(reason.replace('snooze_until:', ''), '')
      : ''
    if (entry.status === 'postponed' && until && new Date(until).getTime() > nowTime) {
      suppressed.add(entry.sourceIdMasked)
    }
    if (['completed', 'dismissed', 'skipped'].includes(entry.status) && safeIso(entry.at, '').slice(0, 10) === now.slice(0, 10)) {
      suppressed.add(entry.sourceIdMasked)
    }
  })

  return suppressed
}

function mergeSmartCandidates(candidates = []) {
  const groups = new Map()
  candidates.forEach((candidate) => {
    const current = groups.get(candidate.group)
    if (!current || candidate.priority > current.priority) {
      groups.set(candidate.group, candidate)
    }
  })

  return [...groups.values()]
}

function hasSmartNotificationInput(input = {}) {
  return Boolean(
    input.healthSnapshot ||
    safeArray(input.meals).length ||
    safeArray(input.weights).length ||
    input.checkIn ||
    input.goalsHabits ||
    input.mealPlans,
  )
}

export function buildSmartNotificationCandidates(input = {}, options = {}) {
  const now = safeIso(options.now, new Date().toISOString())
  const today = getLocalDateString(options.today || now)
  const weights = input.weights || input.healthSnapshot?.weight?.dailyWeights || []
  const latestWeight = getLatestWeight(weights)
  const protein = getProteinSignal(input, today)
  const mealPlan = getMealPlanSignal(input, today)
  const achievements = buildAchievementEngine(input, { analysisDate: today })
  const prediction = buildHealthPredictionModel(input, { analysisDate: today }).dashboard
  const nutritionCoach = buildNutritionCoachModel(input, { analysisDate: today })
  const raw = []

  if (!getTodayWeight(weights, today) && (!latestWeight || daysBetween(latestWeight.localDate, today) >= 3)) {
    raw.push(createSmartCandidate({
      body: latestWeight ? `Senaste viktloggen var ${latestWeight.localDate}.` : 'Ingen viktlogg finns annu.',
      group: 'weight',
      priorityLevel: latestWeight && daysBetween(latestWeight.localDate, today) >= 7 ? 'high' : 'medium',
      title: 'Dags att logga vikt',
    }, { now }))
  }

  if (getDateFromEntry(input.checkIn || {}) !== today && !input.healthSnapshot?.checkIn?.latestToday) {
    raw.push(createSmartCandidate({
      body: 'En kort check-in gor dagens coachning mer relevant.',
      group: 'checkin',
      priorityLevel: 'high',
      title: 'Du har inte checkat in idag',
    }, { now }))
  }

  if (Number.isFinite(protein.goal) && protein.ratio >= 0.75 && protein.ratio < 1) {
    raw.push(createSmartCandidate({
      body: `${protein.remaining} g protein kvar till dagens mal.`,
      group: 'protein',
      priorityLevel: 'medium',
      title: 'Du ligger nara proteinmalet',
    }, { now }))
  } else if (protein.missingDays >= 2) {
    raw.push(createSmartCandidate({
      body: `Proteinmal saknas ${protein.missingDays} dagar denna vecka.`,
      group: 'protein',
      priorityLevel: 'medium',
      title: 'Proteinmal saknas flera dagar',
    }, { now }))
  }

  if (prediction.confidence.label === 'Hög' && Number.isFinite(prediction.healthScoreNextWeek) && prediction.healthScoreNextWeek >= 70) {
    raw.push(createSmartCandidate({
      body: 'Prognosen visar en forsiktigt positiv Health Score-signal.',
      group: 'prediction',
      priorityLevel: 'low',
      title: 'Bra jobbat, Health Score okar',
    }, { now }))
  }

  if (!mealPlan.saveState.dayHasPlan) {
    raw.push(createSmartCandidate({
      body: 'Skapa en lokal dagsplan utifran dina mal.',
      group: 'meal-plan',
      priorityLevel: 'medium',
      title: 'Ingen maltidsplan for idag',
    }, { now }))
  } else if (!mealPlan.saveState.saved) {
    raw.push(createSmartCandidate({
      body: 'Spara dagens AI-plan sa den kan ateranvandas i veckoplanen.',
      group: 'meal-plan',
      priorityLevel: 'medium',
      title: 'Dagens maltidsplan ar inte sparad',
    }, { now }))
  }

  if (!mealPlan.tomorrowState.dayHasPlan) {
    raw.push(createSmartCandidate({
      body: 'Planera morgondagen i veckoplanen nar det passar.',
      group: 'weekly-plan',
      priorityLevel: 'low',
      title: 'Ingen veckoplan for imorgon',
    }, { now }))
  }

  if (achievements.nextAchievement && achievements.nextAchievement.progressPercent >= 80) {
    raw.push(createSmartCandidate({
      body: `${achievements.nextAchievement.progressPercent}% klart mot ${achievements.nextAchievement.title}.`,
      group: 'achievement',
      priorityLevel: 'low',
      title: 'Du ar nara nasta achievement',
    }, { now }))
  }

  if (
    nutritionCoach.dailyCoach?.primaryAdvice?.category &&
    !['data', 'balance'].includes(nutritionCoach.dailyCoach.primaryAdvice.category) &&
    !raw.some((candidate) => ['protein', 'meal-plan'].includes(candidate.group))
  ) {
    raw.push(createSmartCandidate({
      body: nutritionCoach.dailyCoach.primaryAdvice.text,
      group: 'nutrition',
      priorityLevel: nutritionCoach.dailyCoach.primaryAdvice.priority,
      title: 'Nutrition Coach har ett råd',
    }, { now }))
  }

  const notifications = normalizeNotificationsV3(input.reminderState?.notificationsV3, { now })
  const suppressed = getSmartHistorySuppressions(notifications.history, now)

  return mergeSmartCandidates(raw)
    .filter((candidate) => !suppressed.has(candidate.sourceIdMasked))
    .sort((first, second) => second.priority - first.priority || first.title.localeCompare(second.title, 'sv-SE'))
    .slice(0, 3)
}

function dedupeCandidates(candidates = [], lastDeliveredAtBySource = {}, now = new Date().toISOString()) {
  const nowTime = new Date(now).getTime()
  const seenTags = new Set()
  return candidates
    .filter((candidate) => {
      if (!candidate.scheduledAt || seenTags.has(candidate.tag)) return false
      seenTags.add(candidate.tag)
      const lastAt = lastDeliveredAtBySource[candidate.sourceIdMasked]
      if (!lastAt) return true
      return nowTime - new Date(lastAt).getTime() > 45 * 60000
    })
    .sort((first, second) => second.priority - first.priority || first.scheduledAt.localeCompare(second.scheduledAt))
}

export function batchNotificationCandidates(candidates = [], options = {}) {
  const windowMinutes = clamp(options.windowMinutes, 5, 120)
  const sorted = [...candidates].sort((first, second) => first.scheduledAt.localeCompare(second.scheduledAt))
  const batches = []

  sorted.forEach((candidate) => {
    const existing = batches.find((batch) =>
      Math.abs(new Date(batch.scheduledAt).getTime() - new Date(candidate.scheduledAt).getTime()) <= windowMinutes * 60000)
    if (existing) {
      existing.items.push(candidate)
      existing.priority = Math.max(existing.priority, candidate.priority)
      existing.title = `${existing.items.length} påminnelser från Viktkollen`
      existing.body = 'Flera saker ligger nära varandra. Du kan ta dem i lugn takt.'
      return
    }

    batches.push({
      body: candidate.body,
      id: `notification-batch-${hashText(`${candidate.id}|${windowMinutes}`)}`,
      items: [candidate],
      priority: candidate.priority,
      scheduledAt: candidate.scheduledAt,
      tag: candidate.tag,
      title: candidate.title,
    })
  })

  return batches
}

export function buildNotificationPlan(input = {}, options = {}) {
  const now = safeIso(options.now, new Date().toISOString())
  const reminderState = normalizeReminderState(input.reminderState, { now })
  const notifications = normalizeNotificationsV3(reminderState.notificationsV3, { now })
  const adaptiveProfile = buildAdaptiveDeliveryProfile(reminderState)
  const settings = {
    ...notifications.settings,
    batchingWindowMinutes: notifications.settings.batchingWindowMinutes || adaptiveProfile.batchingWindowMinutes,
  }
  const dueReminders = safeArray(input.dueReminders).length
    ? safeArray(input.dueReminders)
    : reminderState.reminders.filter((reminder) => getNextReminderAt(reminder, { now }) && new Date(getNextReminderAt(reminder, { now })) <= new Date(now))
  const reminderCandidates = dueReminders.map((reminder) => createReminderCandidate(reminder, { now, scheduledAt: now }))
  const candidates = dedupeCandidates([
    ...reminderCandidates,
    ...(hasSmartNotificationInput(input) ? buildSmartNotificationCandidates({ ...input, reminderState }, { now }) : []),
    ...createCoachCandidates(input.adaptiveCoachFeedback, { now }),
    ...createWeeklyPlanCandidates(input.weeklyPlan, { now }),
    ...createSyncCandidates(input.syncStatus, { now }),
  ], notifications.lastDeliveredAtBySource, now)
  const quiet = isWithinQuietHours(now, settings.quietHours)
  const adjustedCandidates = quiet
    ? candidates.map((candidate) => ({
      ...candidate,
      reason: 'quiet_hours',
      scheduledAt: getQuietHoursResumeAt(now, settings.quietHours),
      status: 'suppressed',
    }))
    : adaptiveProfile.recommendedDelayMinutes
      ? candidates.map((candidate) => ({
        ...candidate,
        reason: 'adaptive_delay',
        scheduledAt: addMinutesIso(candidate.scheduledAt, adaptiveProfile.recommendedDelayMinutes),
      }))
      : candidates
  const batches = batchNotificationCandidates(adjustedCandidates, { windowMinutes: settings.batchingWindowMinutes || adaptiveProfile.batchingWindowMinutes })

  return {
    adaptiveProfile,
    batches,
    candidates: adjustedCandidates,
    deliveries: quiet ? [] : batches,
    history: notifications.history,
    permission: getNotificationPermission(),
    quietHoursActive: quiet,
    settings,
    upcoming: batches,
  }
}

export function recordNotificationEvent(reminderState = {}, event = {}, options = {}) {
  const now = safeIso(options.now || event.at, new Date().toISOString())
  const state = normalizeReminderState(reminderState, { now })
  const notifications = normalizeNotificationsV3(state.notificationsV3, { now })
  const items = safeArray(event.items).length ? safeArray(event.items) : [event]
  const entries = items.map((item) => normalizeNotificationHistoryEntry({
    at: now,
    batchId: event.batchId || event.id || '',
    notificationId: item.id || event.id || '',
    reason: event.reason || item.reason || '',
    sourceId: item.sourceId,
    sourceIdMasked: item.sourceIdMasked,
    sourceType: item.sourceType || event.sourceType || 'reminder',
    status: event.status || item.status || 'delivered',
    title: item.title || event.title,
  }, { now }))
  const lastDeliveredAtBySource = { ...notifications.lastDeliveredAtBySource }
  entries.forEach((entry) => {
    if (['delivered', 'batched', 'completed'].includes(entry.status)) {
      lastDeliveredAtBySource[entry.sourceIdMasked] = entry.at
    }
  })

  return {
    ...state,
    notificationsV3: {
      ...notifications,
      history: [...notifications.history, ...entries].slice(-notificationHistoryLimit),
      lastDeliveredAtBySource,
    },
    updatedAt: now,
  }
}

export function updateSmartNotificationStatus(reminderState = {}, notification, status, options = {}) {
  const now = safeIso(options.now, new Date().toISOString())
  const snoozeUntil = status === 'postponed'
    ? addMinutesIso(now, clamp(options.snoozeMinutes || 180, 15, 1440))
    : ''

  return recordNotificationEvent(reminderState, {
    items: [notification],
    reason: snoozeUntil ? `snooze_until:${snoozeUntil}` : options.reason || '',
    status,
  }, { now })
}

export function buildNotificationCenterModel(input = {}, options = {}) {
  const now = safeIso(options.now, new Date().toISOString())
  const state = normalizeReminderState(input.reminderState, { now })
  const plan = buildNotificationPlan(input, { now })
  const history = normalizeNotificationsV3(state.notificationsV3, { now }).history.slice().reverse()

  return {
    adaptiveProfile: plan.adaptiveProfile,
    completed: history.filter((entry) => entry.status === 'completed'),
    dismissed: history.filter((entry) => entry.status === 'dismissed' || entry.status === 'skipped'),
    history,
    permission: plan.permission,
    postponed: history.filter((entry) => entry.status === 'postponed' || entry.status === 'suppressed'),
    quietHoursActive: plan.quietHoursActive,
    settings: plan.settings,
    upcoming: plan.upcoming,
    smartRecommendations: plan.candidates.filter((candidate) => candidate.sourceType === 'smart').slice(0, 3),
  }
}

export function buildSmartNotificationCoachContext(input = {}, options = {}) {
  const top = buildSmartNotificationCandidates(input, options)[0] || null

  return top
    ? {
      body: top.body,
      priority: top.priorityLabel,
      recommendation: `I dag rekommenderar jag att ${top.title.toLocaleLowerCase('sv-SE')}.`,
      title: top.title,
    }
    : null
}

export function showNotificationDelivery(delivery) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (window.Notification.permission !== 'granted') return false

  new window.Notification(sanitizeNotificationTitle(delivery.title), {
    body: safeText(delivery.body, 'Du har en frivillig påminnelse i Viktkollen.', 160),
    tag: safeText(delivery.tag || delivery.id, 'viktkollen-notification', 80),
  })

  return true
}

export const notificationEngineInternals = {
  hashText,
  maskEntityId,
  safeText,
}
