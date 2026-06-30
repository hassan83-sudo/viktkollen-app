const WEEKLY_REPORT_ENDPOINT = '/api/weekly-report'

function getWeightTrend(weights = []) {
  if (!Array.isArray(weights) || weights.length < 2) {
    return 'Inte tillräckligt med viktdata ännu.'
  }

  const first = Number(weights[0]?.value)
  const latest = Number(weights.at(-1)?.value)

  if (!Number.isFinite(first) || !Number.isFinite(latest)) {
    return 'Vikttrenden är osäker just nu.'
  }

  const change = Number((latest - first).toFixed(1))

  if (change < 0) {
    return `Vikten är ned ${Math.abs(change).toLocaleString('sv-SE')} kg sedan start.`
  }

  if (change > 0) {
    return `Vikten är upp ${change.toLocaleString('sv-SE')} kg sedan start.`
  }

  return 'Vikten är stabil sedan start.'
}

function getMealPattern(mealHistory = [], meals = []) {
  if (mealHistory.length > 0) {
    return `${mealHistory.length} fotoanalyser ger bättre bild av matmönstret.`
  }

  if (meals.length > 0) {
    return `${meals.length} måltidsnoteringar är loggade.`
  }

  return 'Matmönstret blir tydligare när du loggar fler måltider.'
}

function hasStatus(history = [], key, keywords) {
  const text = history
    .map((entry) => entry.analysis?.[key] || '')
    .join(' ')
    .toLocaleLowerCase('sv-SE')

  return keywords.some((keyword) => text.includes(keyword))
}

/**
 * Builds a local weekly report fallback from app data.
 *
 * @param {object} data
 * @returns {object}
 */
export function makeWeeklyReportFallback(data) {
  const steps = Number(data.checkIn?.steps)
  const energy = Number(data.checkIn?.energy)
  const mealHistory = data.mealHistory || []
  const hasProtein = hasStatus(mealHistory, 'proteinStatus', ['protein'])
  const hasVegetables = hasStatus(mealHistory, 'vegetableStatus', [
    'grön',
    'frukt',
    'sallad',
  ])
  const proactiveRisk = data.proactiveCoach?.dailyRisk
  const proactiveAction = data.proactiveCoach?.nextBestAction

  return {
    biggestProgress:
      mealHistory.length > 0
        ? 'Du har börjat skapa tydligare matdata med fotoanalyser.'
        : 'Du har samlat data som gör nästa vecka lättare att styra.',
    biggestRisk:
      proactiveRisk ||
      (energy <= 3
        ? 'Låg energi kan göra kvällsrutinen svårare.'
        : 'Risken är att nästa steg blir för stort i stället för upprepbart.'),
    focusNextWeek:
      proactiveAction || 'Välj en liten vana att upprepa varje dag.',
    movement:
      Number.isFinite(steps)
        ? `${steps.toLocaleString('sv-SE')} steg i senaste check-in.`
        : 'Stegdata saknas i senaste check-in.',
    nextSteps: [
      hasProtein ? 'Behåll protein i nästa måltid.' : 'Lägg till protein i en måltid per dag.',
      hasVegetables ? 'Fortsätt med grönsaker/frukt.' : 'Lägg till frukt eller grönsaker dagligen.',
      energy <= 4 ? 'Planera återhämtning före hårdare träning.' : 'Ta en kort promenad på en fast tid.',
    ],
    nutritionStatus: hasProtein && hasVegetables
      ? 'Protein och grönsaker syns i matdata.'
      : hasProtein
        ? 'Protein syns, men grönsaker/frukt kan stärkas.'
        : 'Protein och grönsaker kan göras tydligare.',
    recovery:
      energy <= 4
        ? 'Återhämtning bör prioriteras kommande vecka.'
        : 'Energin verkar ge utrymme för en stabil vardagsrutin.',
    source: 'mock',
    summary:
      'Veckan visar framför allt värdet av enkel loggning: vikt, check-in och matdata ger riktning utan att behöva vara perfekt.',
    weightTrend: getWeightTrend(data.weights),
    mealPattern: getMealPattern(mealHistory, data.meals),
  }
}

/**
 * Requests an AI weekly report with local fallback.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createWeeklyReport(data) {
  const fallback = makeWeeklyReportFallback(data)

  try {
    const response = await fetch(WEEKLY_REPORT_ENDPOINT, {
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok || !result.report) {
      return fallback
    }

    return {
      ...fallback,
      ...result.report,
      source: result.source === 'openai' ? 'openai' : 'mock',
    }
  } catch {
    return fallback
  }
}
