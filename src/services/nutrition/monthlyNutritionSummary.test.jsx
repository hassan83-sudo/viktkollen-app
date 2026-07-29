import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MonthlyNutritionDashboard from '../../components/MonthlyNutritionDashboard.jsx'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  buildMonthlyDailyBreakdown,
  buildMonthlyExportPayload,
  buildMonthlyNutritionInsights,
  buildMonthlyNutritionReport,
  buildMonthlyNutritionSummary,
  buildMonthlyTextReport,
  buildMonthlyWeightNutritionRelation,
  buildNextMonthNutritionFocus,
  classifyMonthlyDataCoverage,
  compareNutritionMonths,
  getMonthlyNutritionRange,
  monthlyNutritionInternals,
} from './nutritionEngine.js'

const today = '2026-07-28'
const goals = {
  calories: 2100,
  protein: '108-144 g',
}
const weights = [
  { date: '2026-07-01', value: 91.8 },
  { date: '2026-07-15', value: 91.0 },
  { date: '2026-07-27', value: 90.1 },
]
const previousWeights = [
  { date: '2026-06-01', value: 92.4 },
  { date: '2026-06-29', value: 91.8 },
]
const julyMeals = [
  { calories: 220, date: '2026-07-01', id: 'j1a', name: 'Kvarg med bär', protein: 28, time: '08:00', type: 'frukost' },
  { calories: 620, date: '2026-07-01', id: 'j1b', name: 'Kyckling och ris', protein: 48, time: '12:30', type: 'lunch' },
  { calories: 720, date: '2026-07-01', id: 'j1c', name: 'Lax med potatis', protein: 40, time: '18:00', type: 'middag' },
  { calories: 190, date: '2026-07-02', id: 'j2a', name: 'Två ägg', protein: 14, time: '07:30', type: 'frukost' },
  { calories: 760, date: '2026-07-02', id: 'j2b', name: 'Hamburgare och pommes', protein: 28, time: '21:30', type: 'kvällsmål' },
  { calories: 310, date: '2026-07-05', id: 'j5a', name: 'Havregryn och mjölk', protein: 18, time: '08:10', type: 'frukost' },
  { calories: 540, date: '2026-07-05', id: 'j5b', name: 'Tonfiskpasta', protein: 42, time: '13:00', type: 'lunch' },
  { calories: 430, date: '2026-07-08', id: 'j8a', name: 'Keso och banan', protein: 32, time: '10:00', type: 'mellanmål' },
  { calories: 800, date: '2026-07-09', id: 'j9a', name: 'Pizza', protein: 32, time: '19:00', type: 'middag' },
  { calories: 610, date: '2026-07-12', id: 'j12a', name: 'Kyckling och ris', protein: 50, time: '12:00', type: 'lunch' },
  { calories: 490, date: '2026-07-12', id: 'j12b', name: 'Kvarg med bär', protein: 35, time: '20:00', type: 'kvällsmål' },
  { calories: 650, date: '2026-07-18', id: 'j18a', name: 'Torsk med potatis', protein: 46, time: '18:30', type: 'middag' },
  { calories: 350, date: '2026-07-19', id: 'j19a', name: 'Äggmacka', protein: 24, time: '08:20', type: 'frukost' },
  { calories: 580, date: '2026-07-22', id: 'j22a', name: 'Nötkött och ris', protein: 45, time: '13:20', type: 'lunch' },
  { calories: 260, date: '2026-07-24', id: 'j24a', name: 'Chips och läsk', protein: 4, time: '22:00', type: 'kvällsmål' },
  { calories: 610, date: '2026-07-27', id: 'j27a', name: 'Kyckling och ris', protein: 47, time: '12:20', type: 'lunch' },
  { calories: 480, date: '2026-08-01', id: 'future', name: 'Framtida måltid', protein: 40, time: '12:00', type: 'lunch' },
]
const juneMeals = [
  { calories: 500, date: '2026-06-03', id: 'p1', name: 'Ägg och havregryn', protein: 30, time: '08:00', type: 'frukost' },
  { calories: 650, date: '2026-06-04', id: 'p2', name: 'Kyckling och ris', protein: 42, time: '12:00', type: 'lunch' },
  { calories: 700, date: '2026-06-11', id: 'p3', name: 'Pizza', protein: 28, time: '19:00', type: 'middag' },
  { calories: 590, date: '2026-06-18', id: 'p4', name: 'Lax med potatis', protein: 38, time: '18:00', type: 'middag' },
  { calories: 470, date: '2026-06-25', id: 'p5', name: 'Kvarg med bär', protein: 32, time: '20:00', type: 'kvällsmål' },
]
const allMeals = [...julyMeals, ...juneMeals]

function report(options = {}) {
  return buildMonthlyNutritionReport({
    date: '2026-07-10',
    meals: allMeals,
    nutritionGoals: goals,
    today,
    weights: [...weights, ...previousWeights],
    ...options,
  })
}

function summary(options = {}) {
  return report(options).summary
}

function aiReply(message) {
  return createDeterministicAiCoachReply({
    context: {
      meals: allMeals,
      nutritionGoals: goals,
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights,
    },
    message,
  })
}

describe('Monthly Nutrition Summary V1 service', () => {
  it('creates the July 2026 range', () => {
    const range = getMonthlyNutritionRange('2026-07-10', today)

    expect(range.startDate).toBe('2026-07-01')
    expect(range.endDate).toBe('2026-07-31')
    expect(range.calendarDays).toBe(31)
    expect(range.elapsedDays).toBe(28)
    expect(range.currentMonth).toBe(true)
  })

  it('creates a previous month range', () => {
    const range = getMonthlyNutritionRange('2026-06-12', today)

    expect(range.startDate).toBe('2026-06-01')
    expect(range.endDate).toBe('2026-06-30')
    expect(range.elapsedDays).toBe(30)
  })

  it('creates a future month range without elapsed days', () => {
    const range = getMonthlyNutritionRange('2026-08-12', today)

    expect(range.futureMonth).toBe(true)
    expect(range.elapsedDays).toBe(0)
  })

  it('falls back from invalid date input', () => {
    const range = getMonthlyNutritionRange('inte datum', today)

    expect(range.calendarDays).toBeGreaterThanOrEqual(28)
    expect(range.startDate).toMatch(/^\d{4}-\d{2}-01$/)
  })

  it.each([
    [0, 28, 'none'],
    [2, 28, 'limited'],
    [10, 28, 'partial'],
    [20, 28, 'good'],
    [26, 28, 'near_complete'],
  ])('classifies coverage %s/%s as %s', (registeredDays, possibleDays, level) => {
    expect(classifyMonthlyDataCoverage(registeredDays, possibleDays, true).level).toBe(level)
  })

  it('builds one daily row for every calendar day', () => {
    const days = buildMonthlyDailyBreakdown({ date: '2026-07-10', meals: allMeals, nutritionGoals: goals, today })

    expect(days).toHaveLength(31)
    expect(days[0].date).toBe('2026-07-01')
    expect(days.at(-1).date).toBe('2026-07-31')
  })

  it('filters meals to the chosen month', () => {
    const model = summary()

    expect(model.dailyBreakdown.find((day) => day.date === '2026-07-01').mealCount).toBe(3)
    expect(model.dailyBreakdown.some((day) => day.date === '2026-06-03')).toBe(false)
  })

  it('ignores future meals beyond today', () => {
    const model = summary({ date: '2026-08-10' })

    expect(model.registeredDays).toBe(0)
    expect(model.dailyBreakdown.every((day) => day.isFuture || !day.hasData)).toBe(true)
  })

  it('counts registered days', () => {
    expect(summary().registeredDays).toBe(11)
  })

  it('counts meals in the month', () => {
    expect(summary().mealCount).toBe(16)
  })

  it('sums monthly protein', () => {
    expect(Math.round(summary().totals.protein)).toBe(533)
  })

  it('sums monthly calories', () => {
    expect(Math.round(summary().totals.calories)).toBe(8140)
  })

  it('calculates average protein per registered day', () => {
    expect(Math.round(summary().averages.proteinPerRegisteredDay)).toBe(48)
  })

  it('calculates average calories per registered day', () => {
    expect(Math.round(summary().averages.caloriesPerRegisteredDay)).toBe(740)
  })

  it('calculates average meals per registered day', () => {
    expect(summary().averages.mealsPerRegisteredDay).toBeCloseTo(1.5, 1)
  })

  it('calculates average protein per elapsed day', () => {
    expect(Math.round(summary().averages.proteinPerCalendarDay)).toBe(19)
  })

  it('detects the most protein day', () => {
    expect(summary().mostProteinDay.date).toBe('2026-07-01')
    expect(Math.round(summary().mostProteinDay.totals.protein)).toBe(116)
  })

  it('detects the highest calorie day', () => {
    expect(summary().highestCalorieDay.date).toBe('2026-07-01')
    expect(Math.round(summary().highestCalorieDay.totals.calories)).toBe(1560)
  })

  it('counts protein goal days', () => {
    expect(summary().proteinGoalDays).toBe(1)
  })

  it('keeps the normalized goals on the summary', () => {
    expect(summary().goals.protein).toBe(goals.protein)
    expect(summary().goals.calories).toBe(2100)
  })

  it('builds a weekly breakdown for all weeks touching the month', () => {
    expect(summary().weeklyBreakdown.length).toBeGreaterThanOrEqual(5)
  })

  it('keeps weekly meal counts inside the month', () => {
    const firstWeek = summary().weeklyBreakdown[0]

    expect(firstWeek.mealCount).toBeGreaterThan(0)
    expect(firstWeek.week.days.some((day) => day.date < '2026-07-01')).toBe(true)
  })

  it('calculates weekly averages from registered month days', () => {
    const firstWeek = summary().weeklyBreakdown[0]

    expect(firstWeek.proteinAverage).toBeGreaterThan(40)
    expect(firstWeek.registeredDays).toBeGreaterThan(0)
  })

  it('builds pattern counts for meal types', () => {
    expect(summary().patterns.lunchDays).toBe(5)
    expect(summary().patterns.dinnerDays).toBe(3)
  })

  it('detects late meals', () => {
    expect(summary().patterns.lateMeals).toBeGreaterThanOrEqual(2)
  })

  it('detects recurring meals', () => {
    expect(summary().patterns.recurringMeal.text).toContain('kyckling')
  })

  it('detects the most common meal type', () => {
    expect(summary().patterns.mostCommonMealType.type).toBe('lunch')
  })

  it('calculates protein consistency', () => {
    expect(summary().patterns.proteinConsistency).toBeGreaterThan(0)
  })

  it('calculates calorie consistency', () => {
    expect(summary().patterns.calorieConsistency).toBeGreaterThan(0)
  })

  it('builds a weight relation for the month', () => {
    const relation = summary().weightRelation

    expect(relation.hasData).toBe(true)
    expect(relation.startWeight).toBe(91.8)
    expect(relation.endWeight).toBe(90.1)
    expect(relation.change).toBe(-1.7)
  })

  it('handles missing monthly weight data', () => {
    const relation = buildMonthlyWeightNutritionRelation(summary(), [], today)

    expect(relation.hasData).toBe(false)
    expect(relation.text).toContain('Ingen')
  })

  it('handles one monthly weight entry cautiously', () => {
    const relation = buildMonthlyWeightNutritionRelation(summary(), [{ date: '2026-07-10', value: 91 }], today)

    expect(relation.limited).toBe(true)
    expect(relation.weightCount).toBe(1)
  })

  it('ignores invalid weight entries', () => {
    const relation = buildMonthlyWeightNutritionRelation(summary(), [{ date: '2026-07-10', value: 'fel' }], today)

    expect(relation.hasData).toBe(false)
  })

  it('compares months when both have enough data', () => {
    const current = summary()
    const previous = buildMonthlyNutritionSummary({ date: '2026-06-10', meals: allMeals, nutritionGoals: goals, today })
    const comparison = compareNutritionMonths(current, previous)

    expect(comparison.hasComparison).toBe(true)
    expect(comparison.text.length).toBe(3)
  })

  it('does not compare months with too little previous data', () => {
    const comparison = compareNutritionMonths(summary(), buildMonthlyNutritionSummary({ date: '2026-05-10', meals: [], nutritionGoals: goals, today }))

    expect(comparison.hasComparison).toBe(false)
    expect(comparison.reasons[0]).toContain('lite')
  })

  it('returns comparison difference fields', () => {
    const current = summary()
    const previous = buildMonthlyNutritionSummary({ date: '2026-06-10', meals: allMeals, nutritionGoals: goals, today })
    const comparison = compareNutritionMonths(current, previous)

    expect(Number.isFinite(comparison.proteinAverageDifference)).toBe(true)
    expect(Number.isFinite(comparison.calorieAverageDifference)).toBe(true)
  })

  it('builds monthly insights', () => {
    expect(buildMonthlyNutritionInsights(summary()).length).toBeGreaterThan(0)
  })

  it('adds comparison insight when comparison exists', () => {
    const model = summary()
    const insights = buildMonthlyNutritionInsights(model, report().comparison)

    expect(insights.length).toBeLessThanOrEqual(5)
    expect(report().comparison.hasComparison).toBe(true)
  })

  it('builds next month focus items', () => {
    expect(buildNextMonthNutritionFocus(summary()).length).toBeGreaterThan(0)
  })

  it('creates text report with headline and macros', () => {
    const text = buildMonthlyTextReport(summary(), report().comparison)

    expect(text).toContain('Juli 2026')
    expect(text).toContain('Registrerade dagar')
    expect(text).toContain('Protein i genomsnitt')
  })

  it('builds the full monthly report', () => {
    const fullReport = report()

    expect(fullReport.summary.label).toContain('2026')
    expect(fullReport.previous.label).toContain('Juni')
    expect(fullReport.textReport).toContain('Måltider')
  })

  it('exports a safe payload shape', () => {
    const payload = buildMonthlyExportPayload(report())

    expect(payload.app).toBe('Viktkollen')
    expect(payload.feature).toBe('monthly-nutrition-report')
    expect(payload.month).toBe('2026-07')
    expect(JSON.stringify(payload)).not.toContain('supabase')
  })

  it('uses no raw localStorage data in export', () => {
    expect(Object.keys(buildMonthlyExportPayload(report()))).toEqual(['app', 'feature', 'month', 'reportVersion', 'summary'])
  })

  it.each([
    ['2026-07-01', 3],
    ['2026-07-02', 2],
    ['2026-07-05', 2],
    ['2026-07-08', 1],
    ['2026-07-09', 1],
    ['2026-07-12', 2],
    ['2026-07-18', 1],
    ['2026-07-19', 1],
    ['2026-07-22', 1],
    ['2026-07-24', 1],
    ['2026-07-27', 1],
  ])('tracks meal count for %s', (date, mealCount) => {
    const day = summary().dailyBreakdown.find((entry) => entry.date === date)

    expect(day.mealCount).toBe(mealCount)
  })

  it.each([
    ['2026-07-01', 116],
    ['2026-07-02', 42],
    ['2026-07-05', 60],
    ['2026-07-08', 32],
    ['2026-07-09', 32],
    ['2026-07-12', 85],
    ['2026-07-18', 46],
    ['2026-07-19', 24],
    ['2026-07-22', 45],
    ['2026-07-24', 4],
    ['2026-07-27', 47],
  ])('tracks protein total for %s', (date, protein) => {
    const day = summary().dailyBreakdown.find((entry) => entry.date === date)

    expect(Math.round(day.totals.protein)).toBe(protein)
  })

  it.each([
    ['2026-07-03'],
    ['2026-07-04'],
    ['2026-07-06'],
    ['2026-07-07'],
    ['2026-07-10'],
    ['2026-07-11'],
    ['2026-07-13'],
    ['2026-07-14'],
    ['2026-07-15'],
    ['2026-07-16'],
  ])('marks missing day %s as empty', (date) => {
    const day = summary().dailyBreakdown.find((entry) => entry.date === date)

    expect(day.hasData).toBe(false)
    expect(day.mealCount).toBe(0)
  })

  it('handles empty meal input', () => {
    const model = buildMonthlyNutritionSummary({ date: '2026-07-10', meals: [], nutritionGoals: goals, today })

    expect(model.registeredDays).toBe(0)
    expect(model.mealCount).toBe(0)
  })

  it('handles non-array meal input', () => {
    const model = buildMonthlyNutritionSummary({ date: '2026-07-10', meals: null, nutritionGoals: goals, today })

    expect(model.mealCount).toBe(0)
  })

  it('keeps calories and protein numeric when goals are missing', () => {
    const model = buildMonthlyNutritionSummary({ date: '2026-07-10', meals: allMeals, nutritionGoals: {}, today })

    expect(Number.isFinite(model.totals.calories)).toBe(true)
    expect(Number.isFinite(model.totals.protein)).toBe(true)
  })

  it('does not include future days as registered in current month', () => {
    const model = buildMonthlyNutritionSummary({ date: '2026-07-10', meals: [...allMeals, { date: '2026-07-30', name: 'Framtid', protein: 99, calories: 999 }], nutritionGoals: goals, today })

    expect(model.dailyBreakdown.find((day) => day.date === '2026-07-30').isFuture).toBe(true)
    expect(model.dailyBreakdown.find((day) => day.date === '2026-07-30').hasData).toBe(false)
  })

  it('parses ISO meal dates in local date form', () => {
    const model = buildMonthlyNutritionSummary({
      date: '2026-07-10',
      meals: [{ calories: 300, date: '2026-07-10T10:00:00', name: 'Ägg', protein: 20 }],
      nutritionGoals: goals,
      today,
    })

    expect(model.registeredDays).toBe(1)
  })

  it('uses createdAt when meal date is missing', () => {
    const model = buildMonthlyNutritionSummary({
      date: '2026-07-10',
      meals: [{ calories: 300, createdAt: '2026-07-10T10:00:00', name: 'Ägg', protein: 20 }],
      nutritionGoals: goals,
      today,
    })

    expect(model.registeredDays).toBe(1)
  })

  it('handles same-day multiple meals', () => {
    const day = summary().dailyBreakdown.find((entry) => entry.date === '2026-07-01')

    expect(day.mealCount).toBe(3)
    expect(Math.round(day.totals.calories)).toBe(1560)
  })

  it('exposes monthly internals for navigation', () => {
    expect(monthlyNutritionInternals.addMonths('2026-07-01', -1)).toBe('2026-06-01')
    expect(monthlyNutritionInternals.addMonths('2026-07-01', 1)).toBe('2026-08-01')
  })
})

describe('Monthly Nutrition Dashboard V1 UI', () => {
  function renderDashboard() {
    return renderToStaticMarkup(
      <MonthlyNutritionDashboard
        date="2026-07-10"
        meals={allMeals}
        nutritionGoals={goals}
        weights={weights}
        onDateChange={() => {}}
      />,
    )
  }

  it('renders the month dashboard heading', () => {
    expect(renderDashboard()).toContain('Monthly Nutrition Report')
  })

  it('renders summary cards', () => {
    const html = renderDashboard()

    expect(html).toContain('Registrerade dagar')
    expect(html).toContain('Protein i genomsnitt')
  })

  it('renders copy and export actions', () => {
    const html = renderDashboard()

    expect(html).toContain('Kopiera rapport')
    expect(html).toContain('Exportera JSON')
  })

  it('renders weekly chart controls', () => {
    const html = renderDashboard()

    expect(html).toContain('Veckovis utveckling')
    expect(html).toContain('Protein per vecka')
  })

  it('renders the daily heatmap', () => {
    expect(renderDashboard()).toContain('Månadens registreringar')
  })

  it('renders pattern cards', () => {
    const html = renderDashboard()

    expect(html).toContain('Vanligast måltidstyp')
    expect(html).toContain('Sena mål')
  })

  it('renders weight relation', () => {
    expect(renderDashboard()).toContain('Vikt och kost')
  })

  it('renders insights and next month focus', () => {
    const html = renderDashboard()

    expect(html).toContain('Månadens signaler')
    expect(html).toContain('Fokus nästa månad')
  })

  it('does not render unsafe placeholder values', () => {
    const html = renderDashboard()

    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('[object Object]')
  })
})

describe('AI Coach monthly nutrition answers', () => {
  it('answers broad monthly overview', () => {
    const response = aiReply('Hur har min månad sett ut?')

    expect(response).toContain('Denna månad registrerade du mat')
    expect(response).toContain('protein')
  })

  it('answers monthly average protein', () => {
    const response = aiReply('Vad var mitt genomsnittliga protein denna månad?')

    expect(response).toContain('Protein låg i genomsnitt')
    expect(response).toContain('denna månad')
  })

  it('answers registered food days this month', () => {
    const response = aiReply('Hur många dagar registrerade jag mat denna månad?')

    expect(response).toContain('Du registrerade mat')
    expect(response).toContain('denna månad')
  })

  it('answers protein goal days this month', () => {
    const response = aiReply('Hur många dagar nådde jag proteinmålet denna månad?')

    expect(response).toContain('Proteinmålet nåddes')
  })

  it('answers which week had highest protein', () => {
    const response = aiReply('Vilken vecka hade högst protein denna månad?')

    expect(response).toContain('hade högst protein')
    expect(response).toContain('Veckan')
  })

  it('answers which day had most protein this month', () => {
    const response = aiReply('Vilken dag hade mest protein denna månad?')

    expect(response).toContain('dagen med mest protein')
    expect(response).toContain('2026-07-01')
  })

  it('answers month comparison', () => {
    const response = aiReply('Hur skiljer sig denna månad från förra månaden?')

    expect(response).toContain('föregående')
  })

  it('answers recurring meal question', () => {
    const response = aiReply('Vilken måltid åt jag oftast denna månad?')

    expect(response.toLocaleLowerCase('sv-SE')).toContain('kyckling')
  })

  it('answers monthly weight relation', () => {
    const response = aiReply('Hur förändrades min vikt denna månad?')

    expect(response).toContain('91,8 kg')
    expect(response).toContain('90,1 kg')
  })

  it('answers next month focus', () => {
    const response = aiReply('Vad ska jag fokusera på nästa månad?')

    expect(response.length).toBeGreaterThan(20)
    expect(response).not.toContain('Vill du att vi fokuserar')
  })

  it('keeps direct weekly question on weekly intent', () => {
    const response = aiReply('Hur har min vecka sett ut?')

    expect(response).toContain('7 dagar')
    expect(response).not.toContain('denna månad')
  })
})
