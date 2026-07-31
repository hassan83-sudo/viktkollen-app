import { formatKg, getWeightStats, normalizeDailyWeightEntries } from './healthCalculations.js'

const DAYS_IN_REPORT = 30

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function isWithinLastDays(date, days) {
  const time = new Date(date).getTime()

  if (Number.isNaN(time)) {
    return false
  }

  return time >= Date.now() - days * 24 * 60 * 60 * 1000
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
  return entry?.createdAt || entry?.date || new Date().toISOString()
}

function getMealType(entry) {
  return entry?.mealType || entry?.analysis?.mealType || entry?.type || 'Saknas'
}

function getBestWeek(weights = []) {
  const sortedWeights = [...weights].sort(
    (first, second) => new Date(first.date) - new Date(second.date),
  )
  const weeks = []

  for (let index = 0; index < sortedWeights.length; index += 1) {
    const start = sortedWeights[index]
    const endLimit = new Date(start.date).getTime() + 7 * 24 * 60 * 60 * 1000
    const weekEntries = sortedWeights.filter((entry) => {
      const time = new Date(entry.date).getTime()

      return time >= new Date(start.date).getTime() && time <= endLimit
    })
    const last = weekEntries.at(-1)
    const change = last ? Number((last.value - start.value).toFixed(1)) : 0

    weeks.push({
      change,
      count: weekEntries.length,
      label: `${new Date(start.date).toLocaleDateString('sv-SE')} - ${new Date(endLimit).toLocaleDateString('sv-SE')}`,
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
    meals.map((meal) => new Date(getMealDate(meal)).toLocaleDateString('sv-SE')),
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
  const recentWeights = normalizeDailyWeightEntries(data.weights)
    .filter((entry) => isWithinLastDays(entry?.date, DAYS_IN_REPORT))
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
  const recentMealAnalyses = safeArray(data.mealHistory).filter((entry) =>
    isWithinLastDays(getMealDate(entry), DAYS_IN_REPORT),
  )
  const manualMeals = safeArray(data.meals).filter((entry) =>
    isWithinLastDays(entry?.createdAt || entry?.date || new Date(), DAYS_IN_REPORT),
  )
  const totalMeals = recentMealAnalyses.length + manualMeals.length
  const proteinScores = recentMealAnalyses
    .map((entry) => getProteinScore(entry.proteinStatus || entry.analysis?.proteinStatus))
    .filter((score) => score > 0)
  const vegetableScores = recentMealAnalyses
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
        ...manualMeals.map((meal) => meal.type),
      ],
      'Saknas ännu',
    ),
    generatedAt: new Date().toISOString(),
    source: 'local_ai',
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

  return {
    ...report,
    aiSummary: makeAiSummary(report),
    improvements: makeImprovements(report),
    motivation:
      'Du är på rätt väg. Små förbättringar varje vecka ger stora resultat över tid.',
    monthlyAchievement:
      totalMeals > 0
        ? `Du loggade mat ${getMealDays([...recentMealAnalyses, ...manualMeals])} dagar denna månad.`
        : 'Du har startat månaden. Första loggade måltiden gör rapporten mer personlig.',
    strengths: makeStrengths(report),
  }
}
