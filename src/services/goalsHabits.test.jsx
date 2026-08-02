import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import GoalsHabitsPanel from '../components/GoalsHabitsPanel.jsx'
import { userDataKeys } from './userDataRepository.js'
import { syncStorageAllowlist } from './sync/syncMetadata.js'
import {
  acceptWeeklyFocus,
  buildGoalsHabitsViewModel,
  calculateGoalProgress,
  calculateHabitDayStatus,
  calculateHabitStreak,
  createGoal,
  createHabit,
  goalsHabitsSchemaVersion,
  goalsHabitsStorageKey,
  markManualHabitDone,
  normalizeGoal,
  normalizeGoalsHabitsState,
  normalizeHabit,
  updateGoalsHabitsItemStatus,
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
