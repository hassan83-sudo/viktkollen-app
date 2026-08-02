import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import GoalsHabitsPanel from '../components/GoalsHabitsPanel.jsx'
import { userDataKeys } from './userDataRepository.js'
import { syncStorageAllowlist } from './sync/syncMetadata.js'
import { buildGoalsHabitsLiteSummary } from './goalsHabitsSummary.js'
import {
  acceptWeeklyFocus,
  buildGoalsHabitsDashboardSummary,
  buildGoalsHabitsReportSummary,
  buildGoalsHabitsViewModel,
  calculateGoalProgress,
  calculateHabitDayStatus,
  calculateHabitStreak,
  configureGoalsHabitsReminder,
  createGoal,
  createHabit,
  deleteArchivedGoalsHabitsItem,
  goalsHabitsSchemaVersion,
  goalsHabitsStorageKey,
  markManualHabitDone,
  moveWeeklyFocusToNextWeek,
  normalizeGoal,
  normalizeGoalsHabitsState,
  normalizeHabit,
  restoreGoalsHabitsItem,
  undoManualHabitDone,
  updateGoal,
  updateGoalsHabitsItemStatus,
  updateHabit,
  updateWeeklyFocus,
} from './goalsHabits.js'

const analysisDate = '2026-07-31'
const meals = [
  { date: analysisDate, description: 'kyckling och ris', id: 'meal-1', time: '12:00' },
]
const weights = [
  { date: '2026-07-01', value: 91.8 },
  { date: analysisDate, value: 89.6 },
]
const checkIn = {
  energy: 7,
  mood: 'Fokuserad',
  steps: 8200,
  workout: true,
}
const nutritionGoals = { protein: '90-120 g' }

describe('Goals Habits Streaks V2 service', () => {
  it('normalizes legacy missing state safely', () => {
    const state = normalizeGoalsHabitsState()

    expect(state.schemaVersion).toBe(goalsHabitsSchemaVersion)
    expect(state.goals).toEqual([])
    expect(state.habits).toEqual([])
  })

  it('validates extreme unsafe goals defensively', () => {
    expect(normalizeGoal({ category: 'weight', target: 10, title: 'Extremt' })).toBeNull()
    expect(normalizeGoal({ category: 'steps', target: 999999, title: 'För mycket' })).toBeNull()
    expect(normalizeGoal({ category: 'protein', target: 120, title: 'Protein' })).toMatchObject({ category: 'protein' })
  })

  it('creates stable shaped goals and habits', () => {
    const goal = createGoal({ category: 'steps', target: 8000, title: 'Steg' }, { now: '2026-07-31T08:00:00.000Z' })
    const habit = createHabit({ category: 'custom', title: 'Promenad', trackingMode: 'manual' }, { now: '2026-07-31T08:00:00.000Z' })

    expect(goal.id).toContain('goal-steps-steg')
    expect(habit.trackingMode).toBe('manual')
    expect(normalizeHabit({ ...habit, activeDays: ['bad'] }).activeDays).toHaveLength(7)
  })

  it('calculates automatic habit progress from real app data', () => {
    const state = normalizeGoalsHabitsState({
      habits: [
        createHabit({ category: 'meal_logging', title: 'Logga mat' }),
        createHabit({ category: 'check_in', title: 'Check-in' }),
        createHabit({ category: 'steps', targetCount: 7000, title: 'Steg' }),
        createHabit({ category: 'workout', title: 'Träning' }),
      ],
    })
    const model = buildGoalsHabitsViewModel(state, { checkIn, meals, nutritionGoals, weights }, { analysisDate })

    expect(model.todayHabits.every((item) => item.status.done)).toBe(true)
    expect(model.completionRate).toBe(100)
  })

  it('calculates weight goal progress from the central weight model', () => {
    const goal = createGoal({ category: 'weight', target: 78, title: 'Målvikt' }, { now: '2026-07-31T08:00:00.000Z' })
    const progress = calculateGoalProgress(goal, { profile: { goalWeight: 78 }, weights }, { analysisDate })

    expect(progress.current).toBe(89.6)
    expect(progress.target).toBe(78)
    expect(progress.label).toContain('11,6 kg kvar')
  })

  it('only counts scheduled habit days and keeps skipped days neutral', () => {
    const habit = createHabit({
      activeDays: ['monday'],
      category: 'custom',
      startDate: analysisDate,
      title: 'Måndagsvana',
      trackingMode: 'manual',
    })
    const status = calculateHabitDayStatus(habit, analysisDate, {}, {})
    const streak = calculateHabitStreak(habit, {}, {}, { analysisDate })

    expect(status.scheduled).toBe(false)
    expect(status.skipped).toBe(true)
    expect(streak.message).toBe('Redo att starta om i lugn takt')
  })

  it('does not count planned meals as meal logging', () => {
    const habit = createHabit({ category: 'meal_logging', title: 'Logga mat' })
    const state = normalizeGoalsHabitsState({ habits: [habit] })
    const model = buildGoalsHabitsViewModel(state, {
      meals: [{ date: analysisDate, id: 'planned-meal-1', isPlanned: true, text: 'middag' }],
    }, { analysisDate })

    expect(model.todayHabits[0].status.done).toBe(false)
  })

  it('marks manual habits once and calculates a neutral streak', () => {
    const habit = createHabit({ category: 'custom', startDate: '2026-07-29', title: 'Promenad', trackingMode: 'manual' })
    const first = markManualHabitDone({ habits: [habit] }, habit.id, '2026-07-30', { now: '2026-07-30T12:00:00.000Z' })
    const second = markManualHabitDone(first, habit.id, '2026-07-30', { now: '2026-07-30T13:00:00.000Z' })
    const streak = calculateHabitStreak(habit, {}, second, { analysisDate })

    expect(second.completions).toHaveLength(1)
    expect(streak.longest).toBe(1)
    expect(streak.message).not.toMatch(/förstörde|misslyck/i)
  })

  it('pauses resumes archives and accepts max three weekly focus items', () => {
    const habit = createHabit({ category: 'custom', title: 'Promenad', trackingMode: 'manual' })
    const paused = updateGoalsHabitsItemStatus({ habits: [habit] }, 'habit', habit.id, 'paused', { now: '2026-07-31T12:00:00.000Z' })
    const active = updateGoalsHabitsItemStatus(paused, 'habit', habit.id, 'active', { now: '2026-07-31T13:00:00.000Z' })
    const archived = updateGoalsHabitsItemStatus(active, 'habit', habit.id, 'archived', { now: '2026-07-31T14:00:00.000Z' })
    const withFocus = [1, 2, 3, 4].reduce((current, index) =>
      acceptWeeklyFocus(current, { title: `Fokus ${index}` }, { analysisDate, now: `2026-07-31T1${index}:00:00.000Z` }), {})

    expect(paused.habits[0].status).toBe('paused')
    expect(active.habits[0].status).toBe('active')
    expect(archived.habits[0].archivedAt).toBeTruthy()
    expect(withFocus.weeklyFocus.filter((focus) => focus.status === 'active')).toHaveLength(3)
  })

  it('adds the new technical key to repository and sync allowlist', () => {
    expect(userDataKeys.goalsHabits).toBe(goalsHabitsStorageKey)
    expect(syncStorageAllowlist).toContain(goalsHabitsStorageKey)
  })

  it('edits goals while keeping id and createdAt and writing history', () => {
    const goal = createGoal({ category: 'protein', target: 100, title: 'Protein' }, { now: '2026-07-01T08:00:00.000Z' })
    const result = updateGoal({ goals: [goal] }, goal.id, { target: 120, title: 'Protein varje dag' }, { now: '2026-07-31T08:00:00.000Z' })

    expect(result.error).toBe('')
    expect(result.state.goals[0]).toMatchObject({
      createdAt: '2026-07-01T08:00:00.000Z',
      id: goal.id,
      target: 120,
      title: 'Protein varje dag',
      updatedAt: '2026-07-31T08:00:00.000Z',
    })
    expect(result.state.history.at(-1).type).toBe('edited')
  })

  it('rejects unsafe edits without deleting legacy objects', () => {
    const goal = createGoal({ category: 'steps', target: 8000, title: 'Steg' }, { now: '2026-07-01T08:00:00.000Z' })
    const result = updateGoal({ goals: [goal] }, goal.id, { target: 999999 }, { now: '2026-07-31T08:00:00.000Z' })

    expect(result.error).toContain('stegmål')
    expect(result.state.goals[0].id).toBe(goal.id)
  })

  it('edits habits frequency without rewriting previous completions', () => {
    const habit = createHabit({ category: 'custom', title: 'Promenad', trackingMode: 'manual' }, { now: '2026-07-01T08:00:00.000Z' })
    const withCompletion = markManualHabitDone({ habits: [habit] }, habit.id, '2026-07-30')
    const result = updateHabit(withCompletion, habit.id, { frequency: 'weekly', targetCount: 2 }, { now: '2026-07-31T08:00:00.000Z' })

    expect(result.state.habits[0].frequency).toBe('weekly')
    expect(result.state.completions).toHaveLength(1)
    expect(result.state.history.at(-1).field).toBe('frequency')
  })

  it('supports undo for manual habit completion on the same day', () => {
    const habit = createHabit({ category: 'custom', title: 'Promenad', trackingMode: 'manual' })
    const done = markManualHabitDone({ habits: [habit] }, habit.id, analysisDate)
    const undone = undoManualHabitDone(done, habit.id, analysisDate)

    expect(done.completions).toHaveLength(1)
    expect(undone.completions).toHaveLength(0)
    expect(undone.history.at(-1).type).toBe('manual_completion_undone')
  })

  it('archives restores and permanently deletes only archived items', () => {
    const habit = createHabit({ category: 'custom', title: 'Promenad', trackingMode: 'manual' })
    const archived = updateGoalsHabitsItemStatus({ habits: [habit] }, 'habit', habit.id, 'archived')
    const restored = restoreGoalsHabitsItem(archived, 'habit', habit.id)
    const deletedWhileActive = deleteArchivedGoalsHabitsItem(restored, 'habit', habit.id)
    const deleted = deleteArchivedGoalsHabitsItem(archived, 'habit', habit.id)

    expect(restored.habits[0].status).toBe('active')
    expect(deletedWhileActive.habits).toHaveLength(1)
    expect(deleted.habits).toHaveLength(0)
  })

  it('links reminders and pauses them with habit lifecycle', () => {
    const habit = createHabit({ category: 'custom', title: 'Promenad', trackingMode: 'manual' })
    const withReminder = configureGoalsHabitsReminder({ habits: [habit] }, 'habit', habit.id, { enabled: true, time: '18:30' })
    const paused = updateGoalsHabitsItemStatus(withReminder, 'habit', habit.id, 'paused')

    expect(withReminder.habits[0].reminder).toMatchObject({ enabled: true, time: '18:30' })
    expect(paused.habits[0].reminder).toMatchObject({ enabled: false, paused: true })
    expect(paused.reminders[0]).toMatchObject({ enabled: false, paused: true })
  })

  it('supports weekly focus edit complete decline and move', () => {
    const base = acceptWeeklyFocus({}, { action: 'Ta en promenad', title: 'Rörelse' }, { analysisDate, now: '2026-07-31T08:00:00.000Z' })
    const focus = base.weeklyFocus[0]
    const edited = updateWeeklyFocus(base, focus.id, { action: 'Gå 10 minuter', title: 'Kort rörelse' })
    const completed = updateWeeklyFocus(edited, focus.id, { status: 'completed' })
    const moved = moveWeeklyFocusToNextWeek(edited, focus.id, { now: '2026-07-31T09:00:00.000Z' })

    expect(edited.weeklyFocus[0]).toMatchObject({ action: 'Gå 10 minuter', title: 'Kort rörelse' })
    expect(completed.weeklyFocus[0].status).toBe('completed')
    expect(moved.weeklyFocus.filter((item) => item.status === 'active')).toHaveLength(1)
    expect(moved.weeklyFocus.find((item) => item.movedFromWeekStart)).toBeTruthy()
  })

  it('builds report and dashboard summaries without duplicating calculations', () => {
    const habit = createHabit({ category: 'meal_logging', title: 'Logga mat' })
    const goal = createGoal({ category: 'protein', target: 90, title: 'Protein' })
    const state = normalizeGoalsHabitsState({ goals: [goal], habits: [habit] })
    const report = buildGoalsHabitsReportSummary(state, { meals, nutritionGoals }, { analysisDate })
    const dashboard = buildGoalsHabitsDashboardSummary(state, { meals, nutritionGoals }, { analysisDate })

    expect(report.summary).toContain('aktiva mål')
    expect(report.positiveProgress).toContain('%')
    expect(dashboard).toMatchObject({ title: 'Mål & vanor' })
  })
  it('builds a lightweight goals habits summary for dashboard and reports', () => {
    const habit = createHabit({ category: 'custom', title: 'Promenad', trackingMode: 'manual' })
    const focus = acceptWeeklyFocus({}, { action: 'Gå 10 minuter', title: 'Kort rörelse' }, { analysisDate })
    const state = normalizeGoalsHabitsState({ habits: [habit], weeklyFocus: focus.weeklyFocus })
    const summary = buildGoalsHabitsLiteSummary(state)

    expect(summary).toMatchObject({
      focusTitle: 'Kort rörelse',
      pendingHabits: 1,
      title: 'Mål & vanor',
    })
  })
})

describe('GoalsHabitsPanel', () => {
  it('renders goals habits focus forms and safe empty state', () => {
    const markup = renderToStaticMarkup(
      <GoalsHabitsPanel
        analysisDate={analysisDate}
        checkIn={checkIn}
        goalsHabits={{}}
        meals={meals}
        nutritionGoals={nutritionGoals}
        onGoalsHabitsChange={vi.fn()}
        weights={weights}
      />,
    )

    expect(markup).toContain('Mål &amp; vanor')
    expect(markup).toContain('Skapa mål')
    expect(markup).toContain('Skapa vana')
    expect(markup).toContain(goalsHabitsStorageKey)
    expect(markup).not.toMatch(/NaN|undefined|null|\[object Object\]|förstörde|misslyck/i)
  })
})
