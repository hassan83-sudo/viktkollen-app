import { buildCoachActionSummary } from '../adaptiveCoachActions.js'
import { buildAdaptiveCoachFeedbackSummary } from '../adaptiveCoachFeedback.js'
import { buildAdaptiveCoachTimelineSummary } from '../adaptiveCoachTimeline.js'
import { buildGoalsHabitsLiteSummary } from '../goalsHabitsSummary.js'
import { buildPhotoAnalysisUsageSummary } from '../nutritionPhotoAnalysis.js'
import { normalizeNotificationsV3 } from '../notifications/notificationEngine.js'
import { normalizeReminderState } from '../reminders/reminderModel.js'
import { buildSharedAnalytics } from '../sharedAnalyticsEngine.js'

export const insightsEngineVersion = 1

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function pct(value) {
  if (!Number.isFinite(value)) return 'Saknas'
  return `${Math.round(value).toLocaleString('sv-SE')}%`
}

function trendDirection(current, previous, tolerance = 0.05) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 'insufficient'
  const diff = current - previous
  if (Math.abs(diff) <= tolerance) return 'stable'
  return diff > 0 ? 'up' : 'down'
}

function splitHalf(values) {
  const list = safeArray(values).filter((value) => Number.isFinite(value))
  if (list.length < 2) return { current: null, previous: null }
  const midpoint = Math.floor(list.length / 2)
  const previous = list.slice(0, midpoint)
  const current = list.slice(midpoint)
  const average = (items) => items.reduce((sum, value) => sum + value, 0) / Math.max(items.length, 1)
  return { current: average(current), previous: average(previous) }
}

function makeTrend({ id, label, tolerance = 0.05, unit = '', values = [], positiveDirection = 'up' }) {
  const halves = splitHalf(values)
  const direction = trendDirection(halves.current, halves.previous, tolerance)
  const diff = Number.isFinite(halves.current) && Number.isFinite(halves.previous)
    ? round(halves.current - halves.previous, 1)
    : null
  const improved = direction !== 'insufficient' && direction === positiveDirection

  return {
    current: round(halves.current, 1),
    direction,
    diff,
    id,
    improved,
    label,
    previous: round(halves.previous, 1),
    sampleSize: safeArray(values).filter((value) => Number.isFinite(value)).length,
    text: direction === 'insufficient'
      ? `${label} behöver mer data för trend.`
      : direction === 'stable'
        ? `${label} har varit stabilt.`
        : `${label} går ${direction === 'up' ? 'upp' : 'ned'} jämfört med tidigare del av perioden.`,
    unit,
  }
}

function countReminderHistory(state, action) {
  return normalizeReminderState(state).history.filter((entry) => entry.action === action).length
}

function longestStreak(dates = []) {
  const unique = [...new Set(safeArray(dates).filter(Boolean))].sort()
  if (!unique.length) return 0
  let best = 1
  let current = 1
  for (let index = 1; index < unique.length; index += 1) {
    const prev = new Date(`${unique[index - 1]}T12:00:00`)
    const next = new Date(`${unique[index]}T12:00:00`)
    const diffDays = Math.round((next - prev) / 86400000)
    current = diffDays === 1 ? current + 1 : 1
    best = Math.max(best, current)
  }
  return best
}

function uniqueInsights(items) {
  const seen = new Set()
  return safeArray(items).filter((item) => {
    const key = `${item.title}|${item.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildSignalScore({ adherence, consistency, coverage, momentum }) {
  return Math.round(clamp(
    (coverage * 0.25) + (consistency * 0.25) + (momentum * 0.25) + (adherence * 0.25),
    0,
    100,
  ))
}

export function buildInsightsEngine(data = {}, options = {}) {
  const analysisDate = options.analysisDate || data.today || new Date()
  const shared = buildSharedAnalytics(data, {
    analysisDate,
    period: options.period || data.period || '90d',
  })
  const analysis = shared.analysis
  const trendSeries = shared.trendSeries
  const reminderState = normalizeReminderState(data.reminderState || data.reminders || {})
  const notifications = normalizeNotificationsV3(reminderState.notificationsV3)
  const coachFeedback = buildAdaptiveCoachFeedbackSummary(data.adaptiveCoachFeedback || {}, {
    now: options.now,
  })
  const coachActions = buildCoachActionSummary(data.adaptiveCoachFeedback || {})
  const coachTimeline = buildAdaptiveCoachTimelineSummary(data, {
    analysisDate,
    filter: { period: '90d' },
    now: options.now,
  })
  const goalsHabits = buildGoalsHabitsLiteSummary(data.goalsHabits || {})
  const photoAnalysis = buildPhotoAnalysisUsageSummary(analysis.nutrition?.meals || data.meals || [], shared.period)
  const nutritionDays = safeArray(analysis.nutrition.days)
  const habitEntries = safeArray(analysis.habits.entries)
  const stepEntries = safeArray(data.checkIns).length ? safeArray(data.checkIns) : habitEntries
  const reminderCompleted = countReminderHistory(reminderState, 'completed')
  const reminderSkipped = countReminderHistory(reminderState, 'skipped')
  const reminderSnoozed = countReminderHistory(reminderState, 'snoozed')
  const notificationCompleted = notifications.history.filter((entry) => entry.status === 'completed').length
  const notificationPostponed = notifications.history.filter((entry) => entry.status === 'postponed' || entry.status === 'suppressed').length
  const weightTrend = {
    ...makeTrend({
      id: 'weight',
      label: 'Vikttrend',
      positiveDirection: data.profile?.goal === 'bygga muskler' ? 'up' : 'down',
      unit: 'kg',
      values: safeArray(analysis.weight.weights).map((entry) => entry.value),
    }),
    source: 'sharedAnalytics.weight',
  }
  const proteinTrend = makeTrend({
    id: 'protein',
    label: 'Proteinintaget',
    positiveDirection: 'up',
    tolerance: 2,
    unit: 'g',
    values: nutritionDays.map((day) => day.totals?.protein),
  })
  const calorieTrend = makeTrend({
    id: 'calories',
    label: 'Kaloriintaget',
    positiveDirection: 'stable',
    tolerance: 75,
    unit: 'kcal',
    values: nutritionDays.map((day) => day.totals?.calories),
  })
  const stepsTrend = makeTrend({
    id: 'steps',
    label: 'Stegen',
    positiveDirection: 'up',
    tolerance: 250,
    unit: 'steg',
    values: stepEntries.map((entry) => entry.steps),
  })
  const checkInTrend = makeTrend({
    id: 'checkins',
    label: 'Incheckningarna',
    positiveDirection: 'up',
    values: trendSeries.activity?.[1]?.points?.map((point) => point.value) || habitEntries.map((entry) => entry.energy),
  })
  const reminderCompletionRate = reminderCompleted + reminderSkipped + reminderSnoozed
    ? Math.round((reminderCompleted / (reminderCompleted + reminderSkipped + reminderSnoozed)) * 100)
    : null
  const coachAcceptanceRate = coachFeedback.accepted + coachFeedback.dismissed
    ? Math.round((coachFeedback.accepted / (coachFeedback.accepted + coachFeedback.dismissed)) * 100)
    : null
  const habitConsistency = goalsHabits
    ? clamp((goalsHabits.completedHabits || 0) / Math.max(goalsHabits.activeHabits || goalsHabits.totalHabits || 1, 1) * 100, 0, 100)
    : 0
  const goalCompletion = goalsHabits
    ? clamp((goalsHabits.completedGoals || 0) / Math.max(goalsHabits.activeGoals || goalsHabits.totalGoals || 1, 1) * 100, 0, 100)
    : 0
  const consistency = Math.round(clamp((shared.coverage.ratio * 100 + habitConsistency + (reminderCompletionRate ?? 0)) / 3, 0, 100))
  const adherence = Math.round(clamp(((reminderCompletionRate ?? 0) + (coachAcceptanceRate ?? 0) + habitConsistency + goalCompletion) / 4, 0, 100))
  const improvementCount = [
    weightTrend.improved,
    proteinTrend.improved,
    stepsTrend.improved,
    coachFeedback.completed > 0,
    reminderCompleted > reminderSkipped,
  ].filter(Boolean).length
  const regressionCount = [
    stepsTrend.direction === 'down',
    checkInTrend.direction === 'down',
    reminderSkipped + reminderSnoozed > reminderCompleted + 1,
    goalsHabits?.pendingHabits > 2,
  ].filter(Boolean).length
  const momentum = Math.round(clamp(50 + improvementCount * 12 - regressionCount * 10, 0, 100))
  const coverage = Math.round(clamp(shared.coverage.ratio * 100, 0, 100))
  const confidence = Math.round(clamp((coverage + Math.min(100, shared.coverage.expectedDataPoints || 0)) / 2, 0, 100))
  const score = buildSignalScore({ adherence, consistency, coverage, momentum })
  const mealDates = nutritionDays.filter((day) => day.mealCount > 0).map((day) => day.date)
  const checkInDates = habitEntries.map((entry) => entry.date)
  const milestones = uniqueInsights([
    shared.weightSummary.bestLoggingStreak
      ? { id: 'weight-streak', title: 'Längsta viktstreak', text: `${shared.weightSummary.bestLoggingStreak} dagar med viktdata.` }
      : null,
    longestStreak(mealDates) >= 2
      ? { id: 'meal-streak', title: 'Måltidsstreak', text: `${longestStreak(mealDates)} dagar i rad med måltidsdata.` }
      : null,
    longestStreak(checkInDates) >= 2
      ? { id: 'checkin-streak', title: 'Check-in-streak', text: `${longestStreak(checkInDates)} dagar i rad med check-ins.` }
      : null,
    coachTimeline.completed > 0
      ? { id: 'coach-completed', title: 'Coachframsteg', text: `${coachTimeline.completed} coachåtgärd${coachTimeline.completed === 1 ? '' : 'er'} har markerats klar.` }
      : null,
    reminderCompleted > 0
      ? { id: 'reminder-completed', title: 'Reminder streak', text: `${reminderCompleted} påminnelsehändelse${reminderCompleted === 1 ? '' : 'r'} har genomförts.` }
      : null,
    photoAnalysis.photoMealCount > 0
      ? { id: 'scanner-usage', title: 'Scanner används', text: `${photoAnalysis.photoMealCount} fotoanalyser bidrar till matbilden.` }
      : null,
  ].filter(Boolean)).slice(0, 6)
  const improvementSignals = uniqueInsights([
    proteinTrend.sampleSize >= 2 && proteinTrend.direction === 'stable'
      ? { id: 'protein-stable', title: 'Stabilt protein', text: 'Proteinintaget har varit stabilt i perioden.' }
      : null,
    checkInTrend.sampleSize >= 2 && ['up', 'stable'].includes(checkInTrend.direction)
      ? { id: 'checkins-regular', title: 'Regelbunden check-in', text: 'Incheckningarna har blivit mer regelbundna eller ligger stabilt.' }
      : null,
    reminderCompletionRate !== null && reminderCompletionRate >= 50
      ? { id: 'reminders-improve', title: 'Påminnelser fungerar', text: 'Påminnelser genomförs oftare än de skjuts upp eller hoppas över.' }
      : null,
    coachAcceptanceRate !== null && coachAcceptanceRate >= 50
      ? { id: 'coach-accepted', title: 'Coachråd används', text: 'Coachens rekommendationer accepteras oftare än de avfärdas.' }
      : null,
    weightTrend.improved
      ? { id: 'weight-improved', title: 'Förbättrad vikttrend', text: 'Vikttrenden rör sig i önskad riktning utifrån aktuell målbild.' }
      : null,
  ].filter(Boolean)).slice(0, 5)
  const regressionSignals = uniqueInsights([
    stepsTrend.direction === 'down'
      ? { id: 'steps-down', title: 'Minskad aktivitet', text: 'Stegen är lägre än tidigare del av perioden. Det är en neutral signal att följa.' }
      : null,
    checkInTrend.direction === 'down'
      ? { id: 'checkins-down', title: 'Färre check-ins', text: 'Check-in-underlaget har minskat jämfört med tidigare del av perioden.' }
      : null,
    reminderSkipped + reminderSnoozed > reminderCompleted + 1
      ? { id: 'reminders-postponed', title: 'Fler uppskjutna reminders', text: 'Fler påminnelser skjuts upp eller hoppas över än genomförs.' }
      : null,
    goalsHabits?.pendingHabits > 2
      ? { id: 'habits-pending', title: 'Vanor väntar', text: 'Flera vanor väntar på uppföljning.' }
      : null,
  ].filter(Boolean)).slice(0, 5)
  const insights = uniqueInsights([
    ...improvementSignals,
    ...milestones,
    ...regressionSignals,
    shared.coverage.level === 'missing'
      ? { id: 'missing-coverage', title: 'Datatäckning', text: 'Börja med vikt, måltid eller check-in för att skapa långsiktiga insights.' }
      : null,
    shared.coverage.level === 'partial'
      ? { id: 'partial-coverage', title: 'Datatäckning', text: 'Underlaget räcker delvis, men fler registreringar gör trenderna tryggare.' }
      : null,
  ].filter(Boolean)).slice(0, 8)

  return {
    adherence,
    confidence,
    consistency,
    coverage,
    improvementSignals,
    insights,
    milestones,
    modelVersion: insightsEngineVersion,
    momentum,
    notificationSummary: {
      completed: notificationCompleted,
      historyCount: notifications.history.length,
      postponed: notificationPostponed,
    },
    coachActionSummary: {
      active: coachActions.activeActions?.length || 0,
      completed: coachActions.completed || 0,
      total: coachActions.total || 0,
    },
    regressionSignals,
    score,
    sourceStatus: {
      adaptiveCoach: 'adaptiveCoachFeedback',
      analytics: 'sharedAnalyticsEngine',
      cloudSync: 'statusOnly',
      notifications: 'remindersV2.notificationsV3',
      scanner: 'nutritionPhotoAnalysis',
    },
    trends: {
      calories: calorieTrend,
      checkIns: checkInTrend,
      coachAcceptance: {
        id: 'coachAcceptance',
        label: 'Coach acceptance',
        rate: coachAcceptanceRate,
        text: coachAcceptanceRate === null ? 'Coachdata saknas.' : `${pct(coachAcceptanceRate)} av tydliga coachbeslut är accepterade.`,
      },
      goalCompletion: {
        id: 'goalCompletion',
        label: 'Mål',
        rate: round(goalCompletion, 0),
        text: goalsHabits ? `${pct(goalCompletion)} målföljsamhet i tillgänglig data.` : 'Måldata saknas.',
      },
      habitConsistency: {
        id: 'habitConsistency',
        label: 'Vanor',
        rate: round(habitConsistency, 0),
        text: goalsHabits ? `${pct(habitConsistency)} vanekonsekvens i tillgänglig data.` : 'Vanedata saknas.',
      },
      protein: proteinTrend,
      reminderCompletion: {
        id: 'reminderCompletion',
        label: 'Reminder completion',
        rate: reminderCompletionRate,
        text: reminderCompletionRate === null ? 'Reminderhistorik saknas.' : `${pct(reminderCompletionRate)} av reminderhändelser är genomförda.`,
      },
      scannerUsage: {
        count: photoAnalysis.photoMealCount,
        id: 'scannerUsage',
        label: 'Nutrition scanner',
        text: photoAnalysis.photoMealCount > 0 ? photoAnalysis.text : 'Ingen scanneranvändning i perioden.',
      },
      steps: stepsTrend,
      weight: weightTrend,
    },
  }
}
