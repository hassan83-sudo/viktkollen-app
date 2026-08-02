import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MealReviewPanel from '../../components/nutritionDataQuality/MealReviewPanel.jsx'
import NutritionQualitySummary from '../../components/nutritionDataQuality/NutritionQualitySummary.jsx'
import { createDeterministicAiCoachReply } from '../aiCoachDeterministicReplies.js'
import {
  buildMealQualityReviewModel,
  buildMealsNeedingReview,
  buildMonthlyExportPayload,
  buildMonthlyNutritionReport,
  buildNutritionConfidenceExplanation,
  buildNutritionDataQualitySummary,
  buildNutritionImprovementTips,
  buildWeeklyNutritionReport,
  calculateDailyNutritionSummary,
  classifyNutritionConfidence,
  evaluateNutritionFieldConfidence,
  getEffectiveMealNutrition,
  getNutritionConfidenceLabel,
} from './nutritionEngine.js'

const today = '2026-07-29'
const clearMeal = {
  date: today,
  description: '200 g kyckling, 150 g kokt ris och 100 g broccoli',
  id: 'clear',
  name: 'Kyckling och ris',
  time: '12:00',
  type: 'Lunch',
}
const mediumMeal = {
  date: today,
  description: 'Kyckling och ris',
  id: 'medium',
  name: 'Kyckling och ris',
  time: '12:00',
  type: 'Lunch',
}
const vagueMeal = {
  date: today,
  description: 'Middag',
  id: 'vague',
  name: 'Middag',
  time: '18:00',
  type: 'Middag',
}
const unknownMeal = {
  date: today,
  description: 'hemlagad sås och okänt livsmedel',
  id: 'unknown',
  name: 'Sås',
  time: '19:00',
  type: 'Middag',
}
const partialManualMeal = {
  ...mediumMeal,
  id: 'partial-manual',
  nutritionOverride: { protein: 42 },
}
const fullManualMeal = {
  ...vagueMeal,
  id: 'full-manual',
  nutritionOverride: { calories: 500, carbs: 40, fat: 20, protein: 35 },
}
const zeroManualMeal = {
  ...mediumMeal,
  id: 'zero-manual',
  nutritionOverride: { calories: 0, protein: 0 },
}
const extremeMeal = {
  ...mediumMeal,
  id: 'extreme',
  nutritionOverride: { calories: 99999, protein: 999 },
}

function confidenceFor(meal) {
  return getEffectiveMealNutrition(meal).confidence
}

function coachReply(message, meals = [clearMeal, mediumMeal, vagueMeal, partialManualMeal]) {
  return createDeterministicAiCoachReply({
    context: {
      meals,
      nutritionGoals: { calories: 2100, protein: '108-144 g' },
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights: [
        { date: '2026-07-01', value: 91.8 },
        { date: today, value: 90.1 },
      ],
    },
    message,
  })
}

describe('nutrition confidence model', () => {
  it.each([
    [90, 'high'],
    [60, 'medium'],
    [20, 'low'],
    [0, 'unknown'],
    [Number.NaN, 'unknown'],
  ])('classifies score %s as %s', (score, level) => {
    expect(classifyNutritionConfidence(score)).toBe(level)
  })

  it('labels high confidence in Swedish', () => {
    expect(getNutritionConfidenceLabel('high')).toBe('Tydligt underlag')
  })

  it('labels medium confidence in Swedish', () => {
    expect(getNutritionConfidenceLabel('medium')).toBe('Delvis tydligt underlag')
  })

  it('labels low confidence in Swedish', () => {
    expect(getNutritionConfidenceLabel('low')).toBe('Begränsat underlag')
  })

  it('labels unknown confidence in Swedish', () => {
    expect(getNutritionConfidenceLabel('unknown')).toBe('Kan inte bedömas')
  })

  it('labels manual source separately', () => {
    expect(getNutritionConfidenceLabel('high', 'manual')).toBe('Manuellt korrigerad')
  })

  it('labels partial manual source separately', () => {
    expect(getNutritionConfidenceLabel('medium', 'partial_manual')).toBe('Delvis manuellt korrigerad')
  })

  it('gives high confidence to clear meal with quantities and units', () => {
    expect(confidenceFor(clearMeal).level).toBe('high')
  })

  it('gives medium confidence to clear ingredients without quantities', () => {
    expect(confidenceFor(mediumMeal).level).toBe('medium')
  })

  it('gives low or unknown confidence to vague meal text', () => {
    expect(['low', 'unknown']).toContain(confidenceFor(vagueMeal).level)
  })

  it('handles empty meal text without crashing', () => {
    expect(confidenceFor({ date: today, id: 'empty', name: '' }).level).toBe('unknown')
  })

  it('detects multiple ingredients', () => {
    expect(confidenceFor(clearMeal).reasons.some((reason) => reason.includes('Flera'))).toBe(true)
  })

  it('detects unknown ingredients', () => {
    expect(confidenceFor(unknownMeal).reviewRecommended).toBe(true)
  })

  it('detects missing quantity', () => {
    expect(confidenceFor(mediumMeal).missingInformation).toContain('mängd saknas')
  })

  it('detects missing unit', () => {
    expect(confidenceFor(mediumMeal).missingInformation).toContain('enhet saknas')
  })

  it('detects vague text', () => {
    expect(confidenceFor(vagueMeal).missingInformation).toContain('måltidstexten är för vag')
  })

  it('keeps deterministic result for same meal', () => {
    expect(confidenceFor(clearMeal)).toEqual(confidenceFor(clearMeal))
  })

  it('does not create negative confidence', () => {
    expect(confidenceFor(unknownMeal).score).toBeGreaterThanOrEqual(0)
  })

  it('does not create confidence above max', () => {
    expect(confidenceFor(fullManualMeal).score).toBeLessThanOrEqual(100)
  })

  it('marks extreme values for review', () => {
    expect(confidenceFor(extremeMeal).reviewRecommended).toBe(true)
  })

  it('keeps confidence separate from nutrition totals', () => {
    const effective = getEffectiveMealNutrition(partialManualMeal)

    expect(effective.totals.protein).toBe(42)
    expect(effective.confidence.manualFields).toContain('protein')
  })
})

describe('field confidence', () => {
  it('marks analyzed protein as estimated', () => {
    expect(confidenceFor(clearMeal).fieldConfidence.protein.estimated).toBe(true)
  })

  it('marks analyzed calories as estimated', () => {
    expect(confidenceFor(clearMeal).fieldConfidence.calories.estimated).toBe(true)
  })

  it('keeps carbs field confidence available', () => {
    expect(confidenceFor(mediumMeal).fieldConfidence.carbs.field).toBe('carbs')
  })

  it('keeps fat field confidence available', () => {
    expect(confidenceFor(mediumMeal).fieldConfidence.fat.field).toBe('fat')
  })

  it('keeps fiber field confidence available', () => {
    expect(confidenceFor(mediumMeal).fieldConfidence.fiber.field).toBe('fiber')
  })

  it('marks full manual override as manual source', () => {
    expect(getEffectiveMealNutrition(fullManualMeal).source).toBe('manual')
  })

  it('marks partial override as partial manual', () => {
    expect(getEffectiveMealNutrition(partialManualMeal).source).toBe('partial_manual')
  })

  it('marks manual protein field', () => {
    expect(confidenceFor(partialManualMeal).fieldConfidence.protein.manual).toBe(true)
  })

  it('keeps automatic calories field for partial override', () => {
    expect(confidenceFor(partialManualMeal).fieldConfidence.calories.manual).toBe(false)
  })

  it('accepts manual zero value', () => {
    expect(getEffectiveMealNutrition(zeroManualMeal).totals.protein).toBe(0)
    expect(confidenceFor(zeroManualMeal).manualFields).toContain('protein')
  })

  it('handles malformed override safely', () => {
    expect(confidenceFor({ ...mediumMeal, nutritionOverride: 'trasig' }).level).toBe('medium')
  })

  it('evaluates manual field confidence directly', () => {
    expect(evaluateNutritionFieldConfidence('protein', { manual: true, value: 0 }).level).toBe('high')
  })

  it('evaluates missing field confidence directly', () => {
    expect(evaluateNutritionFieldConfidence('fiber', { value: null }).level).toBe('unknown')
  })
})

describe('explanations and improvement tips', () => {
  it('explains missing amount', () => {
    expect(buildNutritionConfidenceExplanation(confidenceFor(mediumMeal))).toContain('mängd saknas')
  })

  it('explains manual correction', () => {
    expect(buildNutritionConfidenceExplanation(confidenceFor(partialManualMeal))).toContain('manuellt')
  })

  it('explains no analyzable data', () => {
    expect(buildNutritionConfidenceExplanation(confidenceFor({ id: 'blank', date: today }))).toContain('inte tillräckligt')
  })

  it('creates at most two improvement tips', () => {
    expect(buildNutritionImprovementTips(confidenceFor(vagueMeal))).toHaveLength(2)
  })

  it('creates quantity tip when quantity is missing', () => {
    expect(buildNutritionImprovementTips(confidenceFor(mediumMeal)).join(' ')).toContain('mängd')
  })

  it('creates ingredient tip when ingredient is missing', () => {
    expect(buildNutritionImprovementTips(confidenceFor(vagueMeal)).join(' ')).toContain('innehöll')
  })

  it('uses neutral wording', () => {
    const text = buildNutritionConfidenceExplanation(confidenceFor(vagueMeal))

    expect(text).not.toContain('felaktig')
    expect(text).not.toContain('misslyckad')
    expect(text).not.toContain('verifierad')
  })
})

describe('daily quality summary', () => {
  it('handles empty day', () => {
    expect(calculateDailyNutritionSummary([], today).quality.validMealCount).toBe(0)
  })

  it('counts one clear meal', () => {
    const quality = calculateDailyNutritionSummary([clearMeal], today).quality

    expect(quality.validMealCount).toBe(1)
    expect(quality.highConfidenceMeals).toBe(1)
  })

  it('counts several meals', () => {
    expect(calculateDailyNutritionSummary([clearMeal, mediumMeal, vagueMeal], today).quality.validMealCount).toBe(3)
  })

  it('counts analyzed meals', () => {
    expect(calculateDailyNutritionSummary([clearMeal, mediumMeal], today).quality.analyzedMealCount).toBeGreaterThan(0)
  })

  it('counts partial meals', () => {
    expect(calculateDailyNutritionSummary([vagueMeal], today).quality.partiallyAnalyzedMealCount).toBeGreaterThanOrEqual(0)
  })

  it('counts unanalyzed meals', () => {
    expect(calculateDailyNutritionSummary([{ date: today, id: 'blank' }], today).quality.unanalyzedMealCount).toBe(1)
  })

  it('counts manual meals', () => {
    expect(calculateDailyNutritionSummary([partialManualMeal], today).quality.manualMealCount).toBe(1)
  })

  it('reports protein coverage text', () => {
    expect(calculateDailyNutritionSummary([clearMeal], today).quality.macroCoverage.protein.label).toContain('1 av 1')
  })

  it('reports calorie coverage text', () => {
    expect(calculateDailyNutritionSummary([clearMeal, vagueMeal], today).quality.macroCoverage.calories.label).toContain('2 måltider')
  })

  it('does not use false percent wording', () => {
    expect(calculateDailyNutritionSummary([clearMeal], today).quality.analyzedCoverage).not.toContain('%')
  })

  it('deduplicates same meal in daily summary', () => {
    expect(calculateDailyNutritionSummary([clearMeal, clearMeal], today).quality.validMealCount).toBe(1)
  })
})

describe('weekly and monthly quality', () => {
  const weekMeals = [
    clearMeal,
    { ...mediumMeal, date: '2026-07-28', id: 'medium-2' },
    { ...vagueMeal, date: '2026-07-27', id: 'vague-2' },
    { ...partialManualMeal, date: '2026-07-27', id: 'manual-2' },
  ]

  it('handles empty week', () => {
    expect(buildWeeklyNutritionReport({ date: today, meals: [] }).summary.quality.validMealCount).toBe(0)
  })

  it('counts weekly review meals', () => {
    expect(buildWeeklyNutritionReport({ date: today, meals: weekMeals }).summary.quality.reviewMealCount).toBeGreaterThan(0)
  })

  it('counts weekly manual meals', () => {
    expect(buildWeeklyNutritionReport({ date: today, meals: weekMeals }).summary.quality.manualMealCount).toBe(1)
  })

  it('keeps same weekly meal counted once', () => {
    expect(buildWeeklyNutritionReport({ date: today, meals: [clearMeal, clearMeal] }).summary.quality.validMealCount).toBe(1)
  })

  it('handles empty month', () => {
    expect(buildMonthlyNutritionReport({ date: today, meals: [] }).summary.quality.validMealCount).toBe(0)
  })

  it('counts monthly analyzed meals', () => {
    expect(buildMonthlyNutritionReport({ date: today, meals: weekMeals, today }).summary.quality.validMealCount).toBe(4)
  })

  it('counts monthly review meals', () => {
    expect(buildMonthlyNutritionReport({ date: today, meals: weekMeals, today }).summary.quality.reviewMealCount).toBeGreaterThan(0)
  })

  it('exports monthly quality summary', () => {
    const payload = buildMonthlyExportPayload(buildMonthlyNutritionReport({ date: today, meals: weekMeals, today }))

    expect(payload.quality.validMealCount).toBe(4)
    expect(payload.quality.proteinCoverage).toContain('måltider')
  })

  it('does not export debug data in quality summary', () => {
    const payload = buildMonthlyExportPayload(buildMonthlyNutritionReport({ date: today, meals: weekMeals, today }))

    expect(JSON.stringify(payload.quality)).not.toContain('score')
    expect(JSON.stringify(payload.quality)).not.toContain('stack')
  })
})

describe('review list', () => {
  const entries = buildMealQualityReviewModel([clearMeal, mediumMeal, vagueMeal, unknownMeal, extremeMeal, partialManualMeal]).entries

  it('puts unanalyzable or vague meals in review list', () => {
    expect(buildMealsNeedingReview(entries).some((entry) => entry.text.toLocaleLowerCase('sv-SE').includes('middag'))).toBe(true)
  })

  it('prioritizes review list to max five', () => {
    expect(buildMealsNeedingReview(entries).length).toBeLessThanOrEqual(5)
  })

  it('includes reason text', () => {
    expect(buildMealsNeedingReview(entries)[0].reason.length).toBeGreaterThan(5)
  })

  it('includes improvement tips', () => {
    expect(buildMealsNeedingReview(entries).some((entry) => entry.tips.length > 0)).toBe(true)
  })

  it('ignores broken non-object meal entries', () => {
    expect(buildMealQualityReviewModel([null, clearMeal]).entries).toHaveLength(1)
  })

  it('updates when deleted meal disappears', () => {
    const before = buildMealQualityReviewModel([vagueMeal]).reviewMeals.length
    const after = buildMealQualityReviewModel([]).reviewMeals.length

    expect(before).toBe(1)
    expect(after).toBe(0)
  })
})

describe('quality UI', () => {
  it('renders daily quality summary', () => {
    const html = renderToStaticMarkup(<NutritionQualitySummary quality={calculateDailyNutritionSummary([clearMeal], today).quality} />)

    expect(html).toContain('Datakvalitet')
    expect(html).toContain('Protein')
  })

  it('renders review panel', () => {
    const model = buildMealQualityReviewModel([vagueMeal])
    const html = renderToStaticMarkup(<MealReviewPanel entries={model.entries} onEditMeal={() => {}} />)

    expect(html).toContain('Måltider att granska')
    expect(html).toContain('Redigera')
  })

  it('renders filter buttons', () => {
    const model = buildMealQualityReviewModel([vagueMeal])
    const html = renderToStaticMarkup(<MealReviewPanel entries={model.entries} onEditMeal={() => {}} />)

    expect(html).toContain('Begränsat underlag')
    expect(html).toContain('Manuellt korrigerade')
  })

  it('renders aria-expanded on expandable controls', () => {
    const model = buildMealQualityReviewModel([vagueMeal])
    const html = renderToStaticMarkup(<MealReviewPanel entries={model.entries} onEditMeal={() => {}} />)

    expect(html).toContain('aria-expanded')
  })

  it('renders edit aria-label', () => {
    const model = buildMealQualityReviewModel([vagueMeal])
    const html = renderToStaticMarkup(<MealReviewPanel entries={model.entries} onEditMeal={() => {}} />)

    expect(html).toContain('aria-label')
  })
})

describe('AI Coach nutrition quality', () => {
  it('answers daily confidence', () => {
    expect(coachReply('Hur säkra är dagens näringsvärden?')).toContain('måltider')
  })

  it('answers meals to review', () => {
    expect(coachReply('Vilka måltider behöver jag granska?')).toContain('granskas')
  })

  it('answers missing quantities', () => {
    expect(coachReply('Vilka måltider saknar mängder?')).toContain('mängd')
  })

  it('answers calorie uncertainty', () => {
    expect(coachReply('Varför är kalorierna osäkra?')).toContain('Kalorier')
  })

  it('answers weekly quality', () => {
    expect(coachReply('Hur bra är veckans dataunderlag?')).toContain('måltider')
  })

  it('answers monthly quality', () => {
    expect(coachReply('Hur bra är månadens dataunderlag?')).toContain('måltider')
  })

  it('answers manual corrections', () => {
    expect(coachReply('Vilka värden har jag korrigerat manuellt?')).toContain('manuellt')
  })

  it('answers analyzed meal count', () => {
    expect(coachReply('Hur många måltider kunde analyseras?')).toContain('kunde analyseras')
  })

  it('answers improvement tips', () => {
    expect(coachReply('Hur kan jag förbättra måltidsbeskrivningarna?')).toContain('För bättre uppskattningar')
  })

  it('does not claim medical verification', () => {
    expect(coachReply('Hur säkra är dagens näringsvärden?')).not.toContain('medicinskt verifierade')
  })
})

describe('confidence robustness', () => {
  it.each([
    [{ id: 'missing-text', date: today }],
    [{ id: 'blank-text', date: today, description: '   ' }],
    [{ id: 'bad-date', date: 'inte datum', description: 'Kyckling' }],
    [{ id: 'bad-override', date: today, description: 'Kyckling', nutritionOverride: { protein: 'abc' } }],
    [{ id: 'long', date: today, description: 'kyckling '.repeat(300) }],
  ])('does not crash for malformed meal %#', (meal) => {
    expect(() => getEffectiveMealNutrition(meal)).not.toThrow()
  })

  it('does not show NaN in quality summary', () => {
    const text = JSON.stringify(buildNutritionDataQualitySummary(buildMealQualityReviewModel([vagueMeal]).entries))

    expect(text).not.toContain('NaN')
  })

  it('does not show Infinity in quality summary', () => {
    const text = JSON.stringify(buildNutritionDataQualitySummary(buildMealQualityReviewModel([extremeMeal]).entries))

    expect(text).not.toContain('Infinity')
  })

  it('does not show undefined in UI', () => {
    const html = renderToStaticMarkup(<NutritionQualitySummary quality={buildMealQualityReviewModel([vagueMeal]).quality} />)

    expect(html).not.toContain('undefined')
  })

  it('does not show null text in UI', () => {
    const html = renderToStaticMarkup(<NutritionQualitySummary quality={buildMealQualityReviewModel([vagueMeal]).quality} />)

    expect(html).not.toContain('null')
  })

  it('does not show object text in UI', () => {
    const html = renderToStaticMarkup(<NutritionQualitySummary quality={buildMealQualityReviewModel([vagueMeal]).quality} />)

    expect(html).not.toContain('[object Object]')
  })

  it('handles 1000 daily meals', () => {
    const meals = Array.from({ length: 1000 }, (_, index) => ({ ...clearMeal, id: `meal-${index}` }))

    expect(calculateDailyNutritionSummary(meals, today).quality.validMealCount).toBe(1000)
  })

  it('handles 5000 monthly meals', () => {
    const meals = Array.from({ length: 5000 }, (_, index) => ({ ...mediumMeal, date: `2026-07-${String((index % 29) + 1).padStart(2, '0')}`, id: `month-${index}` }))

    expect(buildMonthlyNutritionReport({ date: today, meals, today }).summary.quality.validMealCount).toBe(5000)
  }, 10000)
})
