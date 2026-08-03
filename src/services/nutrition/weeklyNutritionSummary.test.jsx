import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import WeeklyNutritionDashboard from '../../components/WeeklyNutritionDashboard.jsx'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  buildDailyNutritionBreakdown,
  buildNextWeekNutritionFocus,
  buildWeeklyNutritionInsights,
  buildWeeklyNutritionReport,
  buildWeeklyNutritionSummary,
  buildWeeklyNutritionTextSummary,
  classifyDailyGoalProgress,
  classifyWeeklyDataCoverage,
  compareNutritionWeeks,
  getWeeklyNutritionRange,
  weeklyNutritionInternals,
} from './nutritionEngine.js'

const goals = { calories: 2100, protein: 100 }
const weekMeals = [
  { date: '2026-07-27', id: 'mon-1', name: 'Frukost', text: 'två ägg och bröd', time: '08:00', type: 'Frukost' },
  { date: '2026-07-27', id: 'mon-2', name: 'Lunch', text: '200 g kyckling, 150 g ris och broccoli', time: '12:30', type: 'Lunch' },
  { date: '2026-07-28', id: 'tue-1', name: 'Middag', text: 'pizza och läsk', time: '19:00', type: 'Middag' },
  { date: '2026-07-29', id: 'wed-1', name: 'Lunch', text: 'lax och potatis', time: '12:00', type: 'Lunch', nutritionOverride: { protein: 55, calories: 650 } },
  { date: '2026-07-30', id: 'thu-1', name: 'Kvällsmål', text: 'kvarg och banan', time: '21:30', type: 'Kvällsmål' },
  { date: '2026-08-01', id: 'sat-1', name: 'Middag', text: 'hamburgare och pommes', time: '18:30', type: 'Middag' },
]
const previousWeekMeals = [
  { date: '2026-07-20', id: 'p1', name: 'Lunch', text: 'kyckling och ris', time: '12:00', type: 'Lunch' },
  { date: '2026-07-21', id: 'p2', name: 'Middag', text: 'torsk och potatis', time: '18:00', type: 'Middag' },
  { date: '2026-07-22', id: 'p3', name: 'Frukost', text: 'havregryn och mjölk', time: '08:00', type: 'Frukost' },
]

function summary(extra = {}) {
  return buildWeeklyNutritionSummary({
    date: '2026-07-28',
    meals: weekMeals,
    nutritionGoals: goals,
    today: '2026-08-02',
    ...extra,
  })
}

function report(extra = {}) {
  return buildWeeklyNutritionReport({
    date: '2026-07-28',
    meals: [...weekMeals, ...previousWeekMeals],
    nutritionGoals: goals,
    today: '2026-08-02',
    ...extra,
  })
}

function html(props = {}) {
  return renderToStaticMarkup(
    <WeeklyNutritionDashboard
      date="2026-07-28"
      meals={weekMeals}
      nutritionGoals={goals}
      onDateChange={vi.fn()}
      {...props}
    />,
  )
}

function coach(message) {
  return createDeterministicAiCoachReply({
    context: {
      meals: [...weekMeals, ...previousWeekMeals],
      nutritionGoals: goals,
      today: '2026-08-02',
    },
    message,
  })
}

describe('Weekly Nutrition V1 week dates', () => {
  it('uses Monday as week start', () => {
    expect(getWeeklyNutritionRange('2026-07-30').startDate).toBe('2026-07-27')
  })

  it('uses Sunday as week end', () => {
    expect(getWeeklyNutritionRange('2026-07-30').endDate).toBe('2026-08-02')
  })

  it('builds seven week dates', () => {
    expect(getWeeklyNutritionRange('2026-07-30').dates).toHaveLength(7)
  })

  it('handles previous week', () => {
    expect(weeklyNutritionInternals.addDays(getWeeklyNutritionRange('2026-07-30').startDate, -7)).toBe('2026-07-20')
  })

  it('handles next week', () => {
    expect(weeklyNutritionInternals.addDays(getWeeklyNutritionRange('2026-07-30').startDate, 7)).toBe('2026-08-03')
  })

  it('handles year boundary', () => {
    expect(getWeeklyNutritionRange('2027-01-01').startDate).toBe('2026-12-28')
  })

  it('handles week 53-like dates', () => {
    expect(getWeeklyNutritionRange('2020-12-31').startDate).toBe('2020-12-28')
  })

  it('keeps local date near midnight from ISO', () => {
    expect(weeklyNutritionInternals.getMealDate({ date: '2026-07-27T23:30:00' })).toBe('2026-07-27')
  })
})

describe('Weekly Nutrition V1 weekly summary', () => {
  it('returns empty week safely', () => {
    expect(summary({ meals: [] }).registeredDays).toBe(0)
  })

  it('counts one registered day', () => {
    expect(summary({ meals: [weekMeals[0]] }).registeredDays).toBe(1)
  })

  it('keeps all seven days in data', () => {
    expect(summary().days).toHaveLength(7)
  })

  it('counts registered days', () => {
    expect(summary().registeredDays).toBe(5)
  })

  it('sums protein', () => {
    expect(summary().totals.protein).toBeGreaterThan(100)
  })

  it('sums calories', () => {
    expect(summary().totals.calories).toBeGreaterThan(1000)
  })

  it('calculates average per calendar day', () => {
    expect(summary().averages.proteinPerCalendarDay).toBeGreaterThan(0)
  })

  it('calculates average per registered day', () => {
    expect(summary().averages.proteinPerRegisteredDay).toBeGreaterThan(summary().averages.proteinPerCalendarDay)
  })

  it('counts meals', () => {
    expect(summary().mealCount).toBe(weekMeals.length)
  })

  it('counts analyzed meals', () => {
    expect(summary().analyzedMealCount).toBeGreaterThan(0)
  })

  it('finds most protein day', () => {
    expect(summary().mostProteinDay?.hasData).toBe(true)
  })

  it('finds highest calorie day', () => {
    expect(summary().highestCalorieDay?.hasData).toBe(true)
  })

  it('ignores broken meals', () => {
    expect(summary({ meals: [...weekMeals, null, { date: 'trasigt' }] }).mealCount).toBe(weekMeals.length)
  })

  it('ignores future meals', () => {
    expect(summary({ meals: [...weekMeals, { date: '2999-01-01', text: 'pizza' }] }).mealCount).toBe(weekMeals.length)
  })
})

describe('Weekly Nutrition V1 daily breakdown and goals', () => {
  it('marks day without data', () => {
    expect(summary().days.find((day) => day.date === '2026-07-31').hasData).toBe(false)
  })

  it('handles one meal day', () => {
    expect(buildDailyNutritionBreakdown({ date: '2026-07-28', meals: weekMeals, nutritionGoals: goals }).mealCount).toBe(1)
  })

  it('handles several meals day', () => {
    expect(buildDailyNutritionBreakdown({ date: '2026-07-27', meals: weekMeals, nutritionGoals: goals }).mealCount).toBe(2)
  })

  it('uses effective nutrition override', () => {
    expect(buildDailyNutritionBreakdown({ date: '2026-07-29', meals: weekMeals, nutritionGoals: goals, today: '2026-08-02' }).totals.protein).toBe(55)
  })

  it('classifies reached protein goal', () => {
    expect(classifyDailyGoalProgress(100, 100, { hasData: true, type: 'protein' }).status).toBe('reached')
  })

  it('classifies neutral calorie near goal', () => {
    expect(classifyDailyGoalProgress(2150, 2100, { hasData: true, type: 'calories' }).status).toBe('near')
  })

  it('does not classify unregistered day', () => {
    expect(classifyDailyGoalProgress(0, 100, { hasData: false })).toBeNull()
  })

  it('handles missing goal', () => {
    expect(classifyDailyGoalProgress(100, null, { hasData: true })).toBeNull()
  })

  it('counts protein goal days', () => {
    expect(summary().proteinGoalDays).toBeGreaterThanOrEqual(0)
  })

  it('counts calorie goal days neutrally', () => {
    expect(summary().calorieGoalDays).toBeGreaterThanOrEqual(0)
  })
})

describe('Weekly Nutrition V1 coverage comparison patterns insights', () => {
  it('classifies no data', () => {
    expect(classifyWeeklyDataCoverage(0).level).toBe('none')
  })

  it('classifies limited data', () => {
    expect(classifyWeeklyDataCoverage(1).level).toBe('limited')
  })

  it('classifies partial data', () => {
    expect(classifyWeeklyDataCoverage(5).level).toBe('partial')
  })

  it('classifies complete data', () => {
    expect(classifyWeeklyDataCoverage(7).level).toBe('complete')
  })

  it('compares weeks with enough data', () => {
    expect(report().comparison.hasComparison).toBe(true)
  })

  it('avoids comparison with limited data', () => {
    const current = summary({ meals: [weekMeals[0]] })
    const previous = summary({ date: '2026-07-21', meals: [previousWeekMeals[0]] })

    expect(compareNutritionWeeks(current, previous).hasComparison).toBe(false)
  })

  it('finds common meal type', () => {
    expect(summary().patterns.mostCommonMealType).toBeTruthy()
  })

  it('counts breakfast days', () => {
    expect(summary().patterns.breakfastDays).toBeGreaterThan(0)
  })

  it('counts lunch days', () => {
    expect(summary().patterns.lunchDays).toBeGreaterThan(0)
  })

  it('counts dinner days', () => {
    expect(summary().patterns.dinnerDays).toBeGreaterThan(0)
  })

  it('counts late meals', () => {
    expect(summary().patterns.lateMeals).toBeGreaterThan(0)
  })

  it('normalizes recurring text case and whitespace', () => {
    const meals = [
      { date: '2026-07-27', text: 'Kyckling   Ris', type: 'Lunch' },
      { date: '2026-07-28', text: 'kyckling ris', type: 'Lunch' },
    ]

    expect(summary({ meals }).patterns.recurringMealText.count).toBe(2)
  })

  it('builds max four insights', () => {
    expect(buildWeeklyNutritionInsights(summary(), report().comparison).length).toBeLessThanOrEqual(4)
  })

  it('builds next week focus max three', () => {
    expect(buildNextWeekNutritionFocus(summary()).length).toBeLessThanOrEqual(3)
  })

  it('does not use calorie restriction language in focus', () => {
    expect(buildNextWeekNutritionFocus(summary()).join(' ')).not.toMatch(/restriktion|dra ner|förbjud/i)
  })

  it('builds text summary', () => {
    expect(buildWeeklyNutritionTextSummary(summary())).toContain('Registrerade dagar')
  })
})

describe('Weekly Nutrition V1 UI', () => {
  it('renders weekly dashboard', () => {
    expect(html()).toContain('Weekly Nutrition Dashboard')
  })

  it('renders previous week button', () => {
    expect(html()).toContain('Föregående vecka')
  })

  it('renders next week button', () => {
    expect(html()).toContain('Nästa vecka')
  })

  it('renders current week button', () => {
    expect(html()).toContain('Denna vecka')
  })

  it('renders summary cards', () => {
    expect(html()).toContain('Protein i genomsnitt')
  })

  it('renders protein chart aria labels', () => {
    expect(html()).toContain('aria-label="Måndag:')
  })

  it('renders missing day text', () => {
    expect(html()).toContain('Ingen registrerad mat')
  })

  it('renders copy summary button', () => {
    expect(html()).toContain('Kopiera veckosammanfattning')
  })

  it('does not render unsafe values', () => {
    expect(html({ meals: [null, { date: 'trasigt' }] })).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})

describe('Weekly Nutrition V1 AI Coach', () => {
  it('answers weekly summary', () => {
    expect(coach('Hur har min vecka sett ut?')).toContain('registrerade')
  })

  it('answers average protein', () => {
    expect(coach('Vad är mitt genomsnittliga protein denna vecka?')).toContain('Protein låg')
  })

  it('answers protein goal days', () => {
    expect(coach('Hur många dagar nådde jag proteinmålet?')).toContain('Proteinmålet')
  })

  it('answers registered days', () => {
    expect(coach('Hur många dagar registrerade jag mat?')).toContain('7 dagar')
  })

  it('answers highest protein day', () => {
    expect(coach('Vilken dag åt jag mest protein?')).toContain('protein')
  })

  it('answers highest calorie day', () => {
    expect(coach('Vilken dag åt jag flest kalorier?')).toContain('kalorier')
  })

  it('answers previous week comparison', () => {
    expect(coach('Hur skiljer sig denna vecka från förra?')).toContain('föregående vecka')
  })

  it('answers meal regularity', () => {
    expect(coach('Har jag ätit regelbundet denna vecka?')).toContain('måltider')
  })

  it('answers common meal type', () => {
    expect(coach('Vilken måltidstyp registrerade jag oftast?')).toContain('vanligast')
  })

  it('answers next week focus', () => {
    expect(coach('Vad kan jag fokusera på nästa vecka?')).toContain('veck')
  })
})

describe('Weekly Nutrition V1 robustness and performance', () => {
  it('handles 1000 meals', () => {
    const manyMeals = Array.from({ length: 1000 }, (_, index) => ({
      date: ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'][index % 7],
      id: `meal-${index}`,
      text: 'kyckling och ris',
      type: 'Lunch',
    }))

    expect(summary({ meals: manyMeals }).mealCount).toBe(1000)
  })

  it('handles malformed meal list', () => {
    expect(summary({ meals: 'trasigt' }).mealCount).toBe(0)
  })

  it('handles extreme values without unsafe output', () => {
    const markup = html({ meals: [{ date: '2026-07-27', text: '99999 g ris' }] })

    expect(markup).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('one broken meal does not crash', () => {
    expect(() => summary({ meals: [weekMeals[0], { nope: true }] })).not.toThrow()
  })
})
