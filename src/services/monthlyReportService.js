import { formatKg, getWeightStats, normalizeDailyWeightEntries } from './healthCalculations.js'
import {
  addLocalDays,
  getEntryLocalDate,
  getLocalDateString,
  isLocalDateInRange,
  parseDateValue,
} from './localDate.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import { buildGoalsHabitsLiteSummary } from './goalsHabitsSummary.js'
import { buildSharedMonthlyReportModel } from './sharedAnalyticsEngine.js'
import { buildAdaptiveCoachFeedbackSummary } from './adaptiveCoachFeedback.js'
import { buildCoachActionSummary } from './adaptiveCoachActions.js'
import { buildAdaptiveCoachTimelineSummary } from './adaptiveCoachTimeline.js'
import { buildAdaptiveCoachPatternSummary } from './adaptiveCoachPatterns.js'
import { buildAdaptiveCoachStrategy } from './adaptiveCoachStrategy.js'
import { buildPhotoAnalysisUsageSummary } from './nutritionPhotoAnalysis.js'
import { buildInsightsEngine } from './insights/insightsEngine.js'

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function getMostCommon(values, fallback = 'Saknas') {
  const counts = new Map()

  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1)
  })

  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] || fallback
}

function getScoreLabel(value, map, fallback) {
  return map[String(value || '').toLocaleLowerCase('sv-SE')] ?? fallback
}

function getProteinScore(status) {
  return getScoreLabel(status, { högt: 3, lågt: 1, medel: 2 }, 0)
}

function getVegetableScore(status) {
  return getScoreLabel(status, { bra: 2, lågt: 1, 'mycket bra': 3 }, 0)
}

function getAverageScoreLabel(score, labels) {
  if (!Number.isFinite(score) || score <= 0) {
    return 'Saknas'
  }

  if (score >= 2.5) {
    return labels.high
  }

  if (score >= 1.5) {
    return labels.medium
  }

  return labels.low
}

function getMealDate(entry) {
  return getEntryLocalDate(entry)
}

function getMealType(entry) {
  return entry?.mealType || entry?.analysis?.mealType || entry?.type || 'Saknas'
}

function getBestWeek(weights = []) {
  const sortedWeights = [...weights].sort(
    (first, second) => (parseDateValue(first.date)?.getTime() || 0) - (parseDateValue(second.date)?.getTime() || 0),
  )
  const weeks = []

  for (let index = 0; index < sortedWeights.length; index += 1) {
    const start = sortedWeights[index]
    const startDate = getEntryLocalDate(start)
    const endDate = getLocalDateString(addLocalDays(startDate, 6))
    const weekEntries = sortedWeights.filter((entry) => {
      const entryDate = getEntryLocalDate(entry)

      return isLocalDateInRange(entryDate, { end: endDate, start: startDate })
    })
    const last = weekEntries.at(-1)
    const change = last ? Number((last.value - start.value).toFixed(1)) : 0

    weeks.push({
      change,
      count: weekEntries.length,
      label: `${startDate} - ${endDate}`,
    })
  }

  const bestWeek = weeks
    .filter((week) => week.count >= 2)
    .sort((first, second) => first.change - second.change)[0]

  if (!bestWeek) {
    return 'För lite data ännu'
  }

  return bestWeek.change < 0
    ? `${bestWeek.label}: ned ${formatKg(Math.abs(bestWeek.change))}`
    : `${bestWeek.label}: stabil eller upp ${formatKg(bestWeek.change)}`
}

function getMealDays(meals) {
  return new Set(
    meals.map((meal) => getMealDate(meal)).filter(Boolean),
  ).size
}

function makeAiSummary(report) {
  const weightSentence = Number.isFinite(report.weightChange)
    ? report.weightChange < 0
      ? `Du har gått ned ${formatKg(Math.abs(report.weightChange))} den senaste månaden.`
      : report.weightChange > 0
        ? `Du har gått upp ${formatKg(report.weightChange)} den senaste månaden.`
        : 'Vikten har varit stabil den senaste månaden.'
    : 'Det finns inte tillräckligt med viktdata för att räkna månadsförändring ännu.'
  const mealSentence = `Du har registrerat ${report.totalMeals} måltid${report.totalMeals === 1 ? '' : 'er'} de senaste 30 dagarna.`
  const proteinSentence = report.averageProteinRating === 'Saknas'
    ? 'Proteinmönstret blir tydligare när fler måltider analyseras.'
    : `Proteinintaget ser ${report.averageProteinRating.toLocaleLowerCase('sv-SE')} ut.`
  const vegetableSentence = report.averageVegetableRating === 'Saknas'
    ? 'Grönsaksmönstret behöver mer data.'
    : report.averageVegetableRating === 'Lågt'
      ? 'Grönsaker kan ökas något.'
      : 'Grönsaker finns med i flera registreringar.'
  const weighingSentence = report.weighInCount >= 4
    ? 'Fortsätt väga dig regelbundet och följ trenden.'
    : 'Fler invägningar gör månadsbilden tryggare.'

  return [
    weightSentence,
    mealSentence,
    proteinSentence,
    vegetableSentence,
    weighingSentence,
  ]
}

function makeStrengths(report) {
  const strengths = []

  if (report.averageProteinRating === 'Högt' || report.averageProteinRating === 'Medel') {
    strengths.push('Hög proteinnivå')
  }

  if (report.weighInCount >= 4) {
    strengths.push('Regelbundna invägningar')
  }

  if (report.totalMeals >= 10) {
    strengths.push('Bra kontinuitet i matloggning')
  }

  if (report.weightChange < 0) {
    strengths.push('Tydlig vikttrend nedåt')
  }

  return [...strengths, 'Bra kontinuitet', 'Du samlar användbar data'].slice(0, 3)
}

function makeImprovements(report) {
  const improvements = []

  if (report.averageVegetableRating === 'Lågt' || report.averageVegetableRating === 'Saknas') {
    improvements.push('Mer grönsaker')
  }

  if (report.commonMealType !== 'Frukost') {
    improvements.push('Fler frukostar')
  }

  if (report.weighInCount < 4 || report.totalMeals < 10) {
    improvements.push('Jämnare registrering')
  }

  if (report.averageProteinRating === 'Lågt' || report.averageProteinRating === 'Saknas') {
    improvements.push('Mer protein i måltiderna')
  }

  return [...improvements, 'Planera nästa enkla måltid', 'Fortsätt med små steg'].slice(0, 3)
}

/**
 * Creates a local AI-style monthly report from existing local app data.
 *
 * @param {{meals?: object[], mealHistory?: object[], weights?: object[]}} data
 * @returns {object}
 */
export function createMonthlyHealthReport(data = {}) {
  const snapshot = data.healthSnapshot || buildHealthSnapshot(data)
  const sharedReport = buildSharedMonthlyReportModel({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today })
  const reportRange = sharedReport.period
  const recentWeights = normalizeDailyWeightEntries(snapshot.weight.dailyWeights)
    .filter((entry) => isLocalDateInRange(getEntryLocalDate(entry), reportRange))
    .sort((first, second) => new Date(first.date) - new Date(second.date))
  const firstWeight = recentWeights[0]?.value
  const lastWeight = recentWeights.at(-1)?.value
  const weightChange =
    Number.isFinite(firstWeight) && Number.isFinite(lastWeight)
      ? Number((lastWeight - firstWeight).toFixed(1))
      : null
  const weightStats = getWeightStats(recentWeights)
  const averageWeight = recentWeights.length
    ? recentWeights.reduce((sum, entry) => sum + entry.value, 0) / recentWeights.length
    : null
  const actualMeals = snapshot.nutrition.actualMeals
  const coachEffectiveness = buildAdaptiveCoachFeedbackSummary(data.adaptiveCoachFeedback, {
    now: data.today ? `${data.today}T12:00:00.000Z` : undefined,
  })
  const coachActions = buildCoachActionSummary(data.adaptiveCoachFeedback)
  const coachTimeline = buildAdaptiveCoachTimelineSummary(data, {
    analysisDate: data.today,
    filter: { period: '30d' },
    now: data.today ? `${data.today}T12:00:00.000Z` : undefined,
  })
  const coachPatterns = buildAdaptiveCoachPatternSummary(data, {
    analysisDate: data.today,
    days: 30,
    now: data.today ? `${data.today}T12:00:00.000Z` : undefined,
  })
  const coachStrategy = buildAdaptiveCoachStrategy({
    ...data,
    patternSummary: coachPatterns,
  }, {
    analysisDate: data.today,
    period: '30d',
    now: data.today ? `${data.today}T12:00:00.000Z` : undefined,
  })
  const photoAnalysis = buildPhotoAnalysisUsageSummary(actualMeals, reportRange)
  const insights = buildInsightsEngine({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today, period: '90d' })
  const recentMeals = safeArray(actualMeals).filter((entry) =>
    isLocalDateInRange(getMealDate(entry), reportRange),
  )
  const recentMealAnalyses = recentMeals.filter((entry) => entry.analysis || entry.proteinStatus || entry.vegetableStatus)
  const totalMeals = recentMeals.length
  const proteinScores = recentMeals
    .map((entry) => getProteinScore(entry.proteinStatus || entry.analysis?.proteinStatus))
    .filter((score) => score > 0)
  const vegetableScores = recentMeals
    .map((entry) => getVegetableScore(entry.vegetableStatus || entry.analysis?.vegetableStatus))
    .filter((score) => score > 0)
  const averageProteinScore = proteinScores.length
    ? proteinScores.reduce((sum, score) => sum + score, 0) / proteinScores.length
    : 0
  const averageVegetableScore = vegetableScores.length
    ? vegetableScores.reduce((sum, score) => sum + score, 0) / vegetableScores.length
    : 0
  const report = {
    averageProteinRating: getAverageScoreLabel(averageProteinScore, {
      high: 'Högt',
      low: 'Lågt',
      medium: 'Medel',
    }),
    averageVegetableRating: getAverageScoreLabel(averageVegetableScore, {
      high: 'Mycket bra',
      low: 'Lågt',
      medium: 'Bra',
    }),
    averageWeight,
    averageWeightLabel: averageWeight === null ? 'Saknas' : formatKg(averageWeight),
    bestWeek: getBestWeek(recentWeights),
    commonMealType: getMostCommon(
      [
        ...recentMealAnalyses.map(getMealType),
        ...recentMeals.map((meal) => meal.type),
      ],
      'Saknas ännu',
    ),
    generatedAt: new Date().toISOString(),
    period: sharedReport.period,
    source: 'local_ai',
    coachEffectiveness,
    coachActions,
    coachTimeline,
    coachPatterns,
    coachStrategy,
    photoAnalysis,
    insights,
    sharedAnalytics: {
      ...sharedReport,
      coachFeedback: coachEffectiveness,
    },
    totalMeals,
    weighInCount: recentWeights.length,
    weightChange,
    weightChangeLabel:
      weightChange === null
        ? 'Saknas'
        : weightChange < 0
          ? `Ned ${formatKg(Math.abs(weightChange))}`
          : weightChange > 0
            ? `Upp ${formatKg(weightChange)}`
            : 'Stabil',
    weightTrend: weightStats.trend,
  }
  const goalsHabits = buildGoalsHabitsLiteSummary(data.goalsHabits)

  return {
    ...report,
    aiSummary: makeAiSummary(report),
    improvements: sharedReport.attentionItems.map((item) => item.action).filter(Boolean).slice(0, 3).concat(makeImprovements(report)).slice(0, 3),
    goalsHabits,
    motivation:
      'Du är på rätt väg. Små förbättringar varje vecka ger stora resultat över tid.',
    monthlyAchievement:
      totalMeals > 0
        ? `Du loggade mat ${getMealDays(recentMeals)} dagar denna månad.`
        : 'Du har startat månaden. Första loggade måltiden gör rapporten mer personlig.',
    strengths: sharedReport.highlights.map((item) => item.text).slice(0, 3).concat(makeStrengths(report)).slice(0, 3),
  }
}
