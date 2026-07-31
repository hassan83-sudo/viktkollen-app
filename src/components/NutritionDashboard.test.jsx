import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NutritionDashboard from './NutritionDashboard.jsx'
import DailyNutritionSummary from './nutrition/DailyNutritionSummary.jsx'
import { createNutritionDashboardModel } from './nutritionDashboard/nutritionDashboardViewModel.js'
import { makeNutritionGoalProgress } from '../services/nutrition/nutritionEngine.js'

const today = '2026-07-28'

const goals = {
  calories: 2100,
  protein: '108–144 g',
}

const meals = [
  {
    date: today,
    description: 'två ägg och två skivor bröd',
    id: 'breakfast',
    name: 'Frukost',
    time: '08:00',
  },
  {
    date: today,
    description: '200 g kyckling, 150 g ris och broccoli',
    id: 'lunch',
    name: 'Lunch',
    time: '12:30',
  },
  {
    date: today,
    description: 'pizza och läsk',
    id: 'dinner',
    name: 'Middag',
    time: '19:00',
  },
]

function html(props = {}) {
  return renderToStaticMarkup(
    <NutritionDashboard
      date={today}
      meals={meals}
      nutritionGoals={goals}
      {...props}
    />,
  )
}

function dailySummaryHtml(overrides = {}) {
  const summary = {
    byType: [],
    highestProteinMeal: null,
    largestMeal: null,
    mealCount: 0,
    progress: {
      calories: makeNutritionGoalProgress(0, null, 'kcal', 'Kalorier'),
      fiber: makeNutritionGoalProgress(0, null, 'g', 'Fibrer'),
      protein: makeNutritionGoalProgress(0, null, 'g', 'Protein'),
    },
    totals: {
      calories: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      protein: 0,
    },
    ...overrides,
  }

  return renderToStaticMarkup(<DailyNutritionSummary summary={summary} />)
}

describe('Nutrition Dashboard V1 view model', () => {
  it('renders an empty state without broken values', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [],
      nutritionGoals: goals,
    })

    expect(model.hasMeals).toBe(false)
    expect(html({ meals: [] })).toContain('Du har inte registrerat någon måltid idag.')
    expect(html({ meals: [] })).not.toMatch(/NaN|undefined|null|Infinity|\[object Object\]/)
  })

  it('summarizes one meal', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [meals[0]],
      nutritionGoals: goals,
    })

    expect(model.summary.mealCount).toBe(1)
    expect(model.summary.protein).toBe('20 g')
  })

  it('summarizes several meals', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: goals,
    })

    expect(model.summary.mealCount).toBe(3)
    expect(model.summary.calories).toContain('kcal')
  })

  it('sorts meals chronologically', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [meals[2], meals[0], meals[1]],
      nutritionGoals: goals,
    })

    expect(model.timeline.map((row) => row.id)).toEqual(['breakfast', 'lunch', 'dinner'])
  })

  it('shows breakfast lunch and dinner labels', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: goals,
    })

    expect(model.timeline.map((row) => row.mealType)).toEqual(['Frukost', 'Lunch', 'Middag'])
  })

  it('uses generic meal label when type is unknown', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'unknown', name: 'kyckling och ris' }],
      nutritionGoals: goals,
    })

    expect(model.timeline[0].mealType).toBe('Måltid')
  })

  it('marks analyzed meals', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [meals[1]],
      nutritionGoals: goals,
    })

    expect(model.timeline[0].status.label).toBe('Automatisk uppskattning')
  })

  it('marks partially analyzed meals', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'partial', name: 'Lunch', description: 'kyckling och hemlagad sås' }],
      nutritionGoals: goals,
    })

    expect(model.timeline[0].status.label).toContain('Delvis analyserad')
    expect(model.timeline[0].status.detail).toContain('hemlagad sås')
  })

  it('marks meals that could not be analyzed', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'broken', name: 'Hemlagat' }],
      nutritionGoals: goals,
    })

    expect(model.timeline[0].status.label).toBe('Kunde inte analyseras')
  })

  it('ignores future meals for the selected day', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [...meals, { date: '2026-07-29', id: 'future', name: 'pizza' }],
      nutritionGoals: goals,
    })

    expect(model.summary.mealCount).toBe(3)
  })

  it('summarizes protein calories carbs and fat', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: goals,
    })

    expect(model.summary.protein).toMatch(/\d+ g/)
    expect(model.summary.calories).toMatch(/\d+ kcal/)
    expect(model.summary.carbs).toMatch(/\d+ g/)
    expect(model.summary.fat).toMatch(/\d+ g/)
  })

  it('counts analyzed and partially analyzed meals', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [
        meals[0],
        { date: today, id: 'partial', name: 'Lunch kyckling och hemlagad sås' },
        { date: today, id: 'unknown', name: 'Hemlagat' },
      ],
      nutritionGoals: goals,
    })

    expect(model.summary.analyzedMealCount).toBe(2)
    expect(model.summary.partiallyAnalyzedMealCount).toBe(1)
    expect(model.summary.unanalyzedMealCount).toBe(1)
  })

  it('builds protein progress when goal exists', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: goals,
    })

    expect(model.progress.protein.hasGoal).toBe(true)
    expect(model.progress.protein.goalText).toBe('108 g')
  })

  it('builds calorie progress when goal exists', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: goals,
    })

    expect(model.progress.calories.hasGoal).toBe(true)
    expect(model.progress.calories.goalText).toMatch(/2\s?100 kcal/u)
  })

  it('hides progress when goals are missing', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: {},
    })

    expect(model.progress.protein.hasGoal).toBe(false)
    expect(model.progress.calories.hasGoal).toBe(false)
  })

  it('shows reached text when protein goal is passed', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'protein', name: '500 g kyckling' }],
      nutritionGoals: { protein: 100 },
    })

    expect(model.progress.protein.status).toBe('reached')
    expect(model.progress.protein.text).toBe('Målet uppnått')
  })

  it('shows reached text when calorie goal is passed without blame', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'pizza', name: 'stor pizza och läsk' }],
      nutritionGoals: { calories: 500 },
    })

    expect(model.progress.calories.status).toBe('reached')
    expect(model.progress.calories.text).toBe('Målet uppnått')
  })

  it('limits visual progress percent', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'protein', name: '1000 g kyckling' }],
      nutritionGoals: { protein: 100 },
    })

    expect(model.progress.protein.percent).toBeGreaterThan(100)
    expect(model.progress.protein.visualPercent).toBe(100)
  })

  it('shows low protein insight', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'rice', name: 'ris' }],
      nutritionGoals: goals,
    })

    expect(model.insights.join(' ')).toContain('proteinintag')
  })

  it('shows protein goal reached insight', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'protein', name: '500 g kyckling' }],
      nutritionGoals: { protein: 100 },
    })

    expect(model.insights.join(' ')).toContain('proteinmål')
  })

  it('shows no vegetables insight', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [meals[0]],
      nutritionGoals: goals,
    })

    expect(model.insights.join(' ')).toContain('grönsaker')
  })

  it('shows much fast food insight', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [
        { date: today, id: 'burger', name: 'hamburgare' },
        { date: today, id: 'pizza', name: 'pizza' },
      ],
      nutritionGoals: goals,
    })

    expect(model.insights.join(' ')).toContain('snabbmatsmåltider')
  })

  it('shows many sweets insight', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [
        { date: today, id: 'candy', name: 'godis' },
        { date: today, id: 'chips', name: 'chips och läsk' },
      ],
      nutritionGoals: goals,
    })

    expect(model.insights.join(' ')).toContain('snacks')
  })

  it('shows long gap insight', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [
        { date: today, id: 'breakfast', name: 'Frukost två ägg', time: '07:00' },
        { date: today, id: 'dinner', name: 'Middag kyckling och ris', time: '19:00' },
      ],
      nutritionGoals: goals,
    })

    expect(model.insights.join(' ')).toContain('långt uppehåll')
  })

  it('limits insights to three', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [
        { date: today, id: 'candy', name: 'godis', time: '07:00' },
        { date: today, id: 'chips', name: 'chips och läsk', time: '20:00' },
      ],
      nutritionGoals: goals,
    })

    expect(model.insights.length).toBeLessThanOrEqual(3)
  })

  it('shows comparison for most protein meal', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: goals,
    })

    expect(model.comparisons.find((item) => item.label === 'Mest protein')?.text).toContain('Lunch')
  })

  it('shows comparison for largest meal', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: goals,
    })

    expect(model.comparisons.find((item) => item.label === 'Största måltid')?.text).toContain('Middag')
  })

  it('shows comparison for latest meal', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals,
      nutritionGoals: goals,
    })

    expect(model.comparisons.find((item) => item.label === 'Senaste måltid')?.text).toContain('Middag')
  })

  it('omits comparisons when data is missing', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [],
      nutritionGoals: goals,
    })

    expect(model.comparisons).toEqual([])
  })

  it('ignores broken date meals', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: 'trasigt', id: 'bad', name: 'pizza' }],
      nutritionGoals: goals,
    })

    expect(model.summary.mealCount).toBe(0)
  })

  it('handles broken meal objects', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [null, undefined, { date: today, id: 'ok', name: 'ägg' }],
      nutritionGoals: goals,
    })

    expect(model.summary.mealCount).toBe(1)
  })

  it('handles empty meal text', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'empty', name: '' }],
      nutritionGoals: goals,
    })

    expect(model.timeline[0].description).toBe('Måltid utan text')
  })

  it('handles very large values without unsafe output', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'large', name: '9999 g ris' }],
      nutritionGoals: goals,
    })

    expect(JSON.stringify(model)).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/)
  })

  it('updates when a meal is added', () => {
    const before = createNutritionDashboardModel({ date: today, meals: [], nutritionGoals: goals })
    const after = createNutritionDashboardModel({ date: today, meals: [meals[0]], nutritionGoals: goals })

    expect(before.summary.mealCount).toBe(0)
    expect(after.summary.mealCount).toBe(1)
  })

  it('updates when a meal is removed', () => {
    const before = createNutritionDashboardModel({ date: today, meals, nutritionGoals: goals })
    const after = createNutritionDashboardModel({ date: today, meals: meals.slice(0, 1), nutritionGoals: goals })

    expect(before.summary.mealCount).toBe(3)
    expect(after.summary.mealCount).toBe(1)
  })

  it('uses fresh React state input instead of stale storage', () => {
    const model = createNutritionDashboardModel({
      date: today,
      meals: [{ date: today, id: 'fresh', name: '500 g kyckling' }],
      nutritionGoals: goals,
    })

    expect(model.summary.protein).toBe('155 g')
  })

  it('does not write localStorage during model creation', () => {
    const calls = []
    const previous = globalThis.localStorage

    globalThis.localStorage = {
      getItem: () => '[]',
      setItem: (...args) => calls.push(args),
    }

    createNutritionDashboardModel({ date: today, meals, nutritionGoals: goals })
    globalThis.localStorage = previous

    expect(calls).toEqual([])
  })

  it('returns a neutral progress contract when a goal is missing', () => {
    const progress = makeNutritionGoalProgress(42, null, 'g', 'Protein')

    expect(progress.hasGoal).toBe(false)
    expect(progress.percent).toBeNull()
    expect(progress.goalText).toBe('Inget mål satt')
    expect(progress.text).toBe('Inget mål satt')
    expect(progress.visualPercent).toBe(0)
  })

  it('treats zero goals as missing instead of dividing by zero', () => {
    const progress = makeNutritionGoalProgress(42, 0, 'kcal', 'Kalorier')

    expect(progress.hasGoal).toBe(false)
    expect(progress.percent).toBeNull()
    expect(progress.visualPercent).toBe(0)
    expect(JSON.stringify(progress)).not.toMatch(/NaN|Infinity/)
  })

  it('shows zero percent when intake is zero and a goal exists', () => {
    const progress = makeNutritionGoalProgress(0, 120, 'g', 'Protein')

    expect(progress.hasGoal).toBe(true)
    expect(progress.percent).toBe(0)
    expect(progress.visualPercent).toBe(0)
  })

  it('rounds progress below goal', () => {
    const progress = makeNutritionGoalProgress(55, 110, 'g', 'Protein')

    expect(progress.percent).toBe(50)
    expect(progress.text).toBe('55 g kvar')
  })

  it('keeps text percent above goal but clamps visual progress', () => {
    const progress = makeNutritionGoalProgress(150, 100, 'g', 'Protein')

    expect(progress.percent).toBe(150)
    expect(progress.visualPercent).toBe(100)
    expect(progress.text).toBe('Målet uppnått')
  })
})

describe('Nutrition Dashboard V1 render', () => {
  it('renders semantic dashboard sections', () => {
    const markup = html()

    expect(markup).toContain('Nutrition Dashboard')
    expect(markup).toContain('Dagens tidslinje')
    expect(markup).toContain('Insikter')
  })

  it('renders progressbars with accessible names and values', () => {
    const markup = html()

    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('aria-labelledby="nutrition-dashboard-protein-label"')
    expect(markup).toContain('aria-labelledby="nutrition-dashboard-kalorier-label"')
    expect(markup).toContain('aria-valuetext=')
  })

  it('renders partial analysis detail', () => {
    const markup = html({
      meals: [{ date: today, id: 'partial', name: 'Lunch kyckling och hemlagad sås' }],
    })

    expect(markup).toContain('Delvis analyserad')
    expect(markup).toContain('hemlagad sås')
  })

  it('does not render unsafe placeholder values', () => {
    expect(html()).not.toMatch(/NaN|undefined|null|Infinity|\[object Object\]/)
  })

  it('renders missing daily nutrition goals as neutral fallback text', () => {
    const markup = dailySummaryHtml()

    expect(markup).toContain('Inget mål satt')
    expect(markup).not.toMatch(/undefined%|NaN%|Infinity%/)
  })

  it('renders zero percent for zero intake with valid goals', () => {
    const markup = dailySummaryHtml({
      progress: {
        calories: makeNutritionGoalProgress(0, 2000, 'kcal', 'Kalorier'),
        fiber: makeNutritionGoalProgress(0, 30, 'g', 'Fibrer'),
        protein: makeNutritionGoalProgress(0, 120, 'g', 'Protein'),
      },
    })

    expect(markup).toContain('0% - Kalorier')
    expect(markup).toContain('0% - Protein')
    expect(markup).toContain('0% - Fibrer')
  })

  it('does not leak null undefined NaN or Infinity from daily nutrition values', () => {
    const markup = dailySummaryHtml({
      progress: {
        calories: makeNutritionGoalProgress(Number.NaN, undefined, 'kcal', 'Kalorier'),
        fiber: makeNutritionGoalProgress(undefined, undefined, 'g', 'Fibrer'),
        protein: makeNutritionGoalProgress(null, undefined, 'g', 'Protein'),
      },
      totals: {
        calories: Number.NaN,
        carbs: undefined,
        fat: null,
        fiber: Number.POSITIVE_INFINITY,
        protein: undefined,
      },
    })

    expect(markup).not.toMatch(/undefined%|NaN%|Infinity%|null%|\[object Object\]/)
  })

  it('keeps the meal center month label correctly encoded', () => {
    const source = readFileSync(new URL('./MealLogger.jsx', import.meta.url), 'utf8')

    expect(source).toContain('Månad')
    expect(source).not.toContain('MÃ¥nad')
  })

  it('does not render known mojibake patterns in nutrition UI', () => {
    const markup = `${html()} ${dailySummaryHtml()}`

    expect(markup).not.toMatch(/MÃ|Ã¥|Ã¤|Ã¶|Â|â/)
  })
})
