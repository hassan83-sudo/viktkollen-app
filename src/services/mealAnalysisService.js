import { createAiResponseModel } from './aiFallbackEngine.js'
import {
  getCurrentAiAuthorization,
  hasSameAiAuthUser,
} from './ai/aiAuthTransport.js'
import {
  normalizeAnalysisQuality,
  normalizeEstimatedNutrition,
  normalizePortionEstimate,
} from './nutritionPhotoEstimates.js'

const MEAL_ANALYSIS_ENDPOINT = '/api/meal-analysis'

export const fallbackMealAnalysis = {
  calories: 540,
  carbs: 58,
  cheapNextMealSuggestion:
    'Liknande måltid billigare: byt dyrare protein mot kyckling, ägg, bönor eller tofu.',
  confidence: 'låg',
  coachSummary:
    'Protein ser ut att finnas med. Grönsakerna kan ökas lite. I övrigt är detta en bra måltid.',
  explanation:
    'Detta är en försiktig uppskattning. Bildanalys kan missa mängder, ingredienser och tillagning.',
  fat: 18,
  fiberCarbBalance:
    'Kolhydratdelen ser rimlig ut. Lägg gärna till fullkorn eller grönsaker för mer fiber.',
  foods: ['trolig proteinkälla', 'troliga grönsaker', 'trolig kolhydratkälla'],
  improvement: 'Lägg till mer grönsaker.',
  improvementSuggestion: 'Lägg till mer grönsaker.',
  likelyCarbs: 'kan innehålla ris, potatis, pasta eller annan kolhydratkälla',
  likelyProtein: 'ser ut att innehålla en proteinkälla',
  likelyVegetables: 'troligen grönsaker eller sallad',
  mealType: 'Lunch',
  portionEstimate: 'Lagom',
  portionSize: 'Lagom',
  positiveFeedback: 'Bra att måltiden verkar ha flera delar som kan ge mättnad.',
  protein: 32,
  proteinStatus: 'Medel',
  source: 'mock',
  summary:
    'Måltiden ser ut att ha protein, någon grönsak och en kolhydratkälla.',
  vegetableStatus: 'Bra',
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('sv-SE')
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function normalizeStatus(value, allowed, fallback) {
  const text = normalizeText(value)
  const match = allowed.find((item) => text === normalizeText(item))

  return match || fallback
}

function getAnalysisText(analysis = {}) {
  return [
    analysis.summary,
    analysis.likelyProtein,
    analysis.likelyVegetables,
    analysis.likelyCarbs,
    analysis.positiveFeedback,
    analysis.improvementSuggestion,
    Array.isArray(analysis.foods) ? analysis.foods.join(' ') : '',
  ]
    .join(' ')
    .toLocaleLowerCase('sv-SE')
}

function inferMealType(analysis = {}) {
  const text = getAnalysisText(analysis)
  const hour = new Date().getHours()

  if (
    includesAny(text, [
      'frukost',
      'yoghurt',
      'gröt',
      'havre',
      'äggmacka',
      'bär',
      'smoothie',
    ])
  ) {
    return 'Frukost'
  }

  if (includesAny(text, ['mellanmål', 'kvarg', 'frukt', 'nötter', 'macka'])) {
    return 'Mellanmål'
  }

  if (includesAny(text, ['middag', 'potatis', 'pasta', 'ris', 'kyckling', 'fisk'])) {
    return hour >= 16 ? 'Middag' : 'Lunch'
  }

  if (hour < 10) {
    return 'Frukost'
  }

  if (hour >= 16) {
    return 'Middag'
  }

  return 'Lunch'
}

function inferProteinStatus(analysis = {}) {
  const text = getAnalysisText(analysis)
  const protein = Number(analysis.protein)

  if (
    Number.isFinite(protein) ||
    includesAny(text, ['kyckling', 'lax', 'fisk', 'ägg', 'keso', 'kvarg', 'tofu', 'bön', 'linser', 'kött', 'tonfisk'])
  ) {
    if (protein >= 35 || includesAny(text, ['kyckling', 'lax', 'tonfisk', 'keso', 'kvarg'])) {
      return 'Högt'
    }

    if (protein >= 18 || includesAny(text, ['ägg', 'tofu', 'bön', 'linser', 'protein'])) {
      return 'Medel'
    }
  }

  return 'Lågt'
}

function inferVegetableStatus(analysis = {}) {
  const text = getAnalysisText(analysis)

  if (includesAny(text, ['mycket grön', 'stor sallad', 'flera grönsaker', 'grönsaker och sallad'])) {
    return 'Mycket bra'
  }

  if (includesAny(text, ['grön', 'sallad', 'tomat', 'gurka', 'broccoli', 'morot', 'paprika', 'frukt', 'bär'])) {
    return 'Bra'
  }

  return 'Lågt'
}

function inferPortionSize(analysis = {}) {
  const text = getAnalysisText(analysis)
  const calories = Number(analysis.calories)

  if (includesAny(text, ['liten portion', 'lätt måltid']) || (Number.isFinite(calories) && calories < 350)) {
    return 'Liten'
  }

  if (includesAny(text, ['stor portion', 'rejäl portion']) || (Number.isFinite(calories) && calories > 750)) {
    return 'Stor'
  }

  return 'Lagom'
}

function makeCheapAlternative(analysis = {}) {
  const text = getAnalysisText(analysis)

  if (includesAny(text, ['lax', 'räkor', 'oxfilé', 'biff'])) {
    return 'Liknande måltid billigare: byt lax eller dyrare kött mot kyckling, ägg eller bönor.'
  }

  if (includesAny(text, ['kyckling', 'fisk', 'kött'])) {
    return 'Liknande måltid billigare: byt proteinet mot ägg, bönor, linser eller tofu ibland.'
  }

  return 'Liknande måltid billigare: bygg basen på ägg, potatis, bönor, linser eller frysta grönsaker.'
}

function makeSingleImprovement({ proteinStatus, portionSize, vegetableStatus }) {
  if (proteinStatus === 'Lågt') {
    return 'Lägg till mer protein.'
  }

  if (vegetableStatus === 'Lågt') {
    return 'Lägg till en frukt eller grönsak.'
  }

  if (vegetableStatus === 'Bra') {
    return 'Lägg till lite mer grönsaker.'
  }

  if (portionSize === 'Stor') {
    return 'Spara en del av portionen till senare.'
  }

  return 'Behåll samma enkla måltidsstruktur.'
}

function makeCoachSummary({ portionSize, proteinStatus, vegetableStatus }) {
  const proteinText = proteinStatus === 'Högt'
    ? 'Protein ser bra ut.'
    : proteinStatus === 'Medel'
      ? 'Protein ser okej ut.'
      : 'Protein kan stärkas lite.'
  const vegetableText = vegetableStatus === 'Mycket bra'
    ? 'Grönsakerna ser mycket bra ut.'
    : vegetableStatus === 'Bra'
      ? 'Grönsakerna finns med men kan ökas lite.'
      : 'Grönsaker eller frukt kan läggas till.'
  const portionText = portionSize === 'Lagom'
    ? 'I övrigt är detta en lagom måltid.'
    : `Portionen ser ${portionSize.toLocaleLowerCase('sv-SE')} ut, så justera efter hunger och dagsform.`

  return `${proteinText} ${vegetableText} ${portionText}`
}

/**
 * Normalizes a meal analysis into the UI model.
 *
 * @param {object} analysis
 * @returns {object}
 */
export function normalizeMealAnalysis(analysis = {}) {
  const baseAnalysis = {
    ...fallbackMealAnalysis,
    ...analysis,
    foods: Array.isArray(analysis.foods)
      ? analysis.foods.map(String).slice(0, 8)
      : fallbackMealAnalysis.foods,
  }
  const mealType = normalizeStatus(
    analysis.mealType || analysis.type,
    ['Frukost', 'Lunch', 'Middag', 'Mellanmål'],
    inferMealType(baseAnalysis),
  )
  const proteinStatus = normalizeStatus(
    analysis.proteinStatus,
    ['Lågt', 'Medel', 'Högt'],
    inferProteinStatus(baseAnalysis),
  )
  const vegetableStatus = normalizeStatus(
    analysis.vegetableStatus,
    ['Lågt', 'Bra', 'Mycket bra'],
    inferVegetableStatus(baseAnalysis),
  )
  const portionSize = normalizeStatus(
    analysis.portionSize || analysis.portionEstimate,
    ['Liten', 'Lagom', 'Stor'],
    inferPortionSize(baseAnalysis),
  )
  const normalizedConfidence = String(baseAnalysis.confidence || 'låg').toLocaleLowerCase('sv-SE').includes('hög')
    ? 'high'
    : String(baseAnalysis.confidence || 'låg').toLocaleLowerCase('sv-SE').includes('medel')
      ? 'medium'
      : 'low'
  const improvement = makeSingleImprovement({
    portionSize,
    proteinStatus,
    vegetableStatus,
  })
  const normalizedAnalysis = {
    ...baseAnalysis,
    analysisQuality: normalizeAnalysisQuality(analysis.analysisQuality, {
      confidence: normalizedConfidence,
      limitations: [baseAnalysis.explanation],
      summary: baseAnalysis.summary,
    }),
    cheapNextMealSuggestion: makeCheapAlternative(baseAnalysis),
    coachSummary: makeCoachSummary({
      portionSize,
      proteinStatus,
      vegetableStatus,
    }),
    improvement,
    improvementSuggestion: improvement,
    mealType,
    estimatedNutrition: normalizeEstimatedNutrition(analysis.estimatedNutrition || baseAnalysis, {
      confidence: normalizedConfidence,
    }),
    portionEstimate: portionSize,
    portionEstimateRange: normalizePortionEstimate(analysis.portionEstimateRange || analysis.portionEstimate || portionSize, {
      confidence: normalizedConfidence,
      fallbackDescription: portionSize,
    }),
    portionSize,
    proteinStatus,
    vegetableStatus,
  }
  const commonResponse = createAiResponseModel({
    actions: [
      normalizedAnalysis.improvementSuggestion,
      normalizedAnalysis.cheapNextMealSuggestion,
    ].filter(Boolean),
    confidence: normalizedAnalysis.confidence,
    followUp: 'Vill du ha förslag på nästa måltid?',
    source: normalizedAnalysis.source || 'mock',
    sourceReason: normalizedAnalysis.sourceReason || 'meal_analysis',
    status: normalizedAnalysis.status || 'completed',
    summary: normalizedAnalysis.summary,
    title: normalizedAnalysis.title || 'AI-matanalys',
    warnings: ['Analysen är en uppskattning, inte medicinsk rådgivning.'],
  })

  return {
    ...commonResponse,
    ...normalizedAnalysis,
  }
}

/**
 * Requests meal photo analysis from the backend.
 *
 * @param {{checkIn: object, foods: object[], image: string, meals: object[], profile: object | null}} payload
 * @returns {Promise<object>}
 */
export async function analyzeMealPhoto(payload) {
  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) {
      return normalizeMealAnalysis(fallbackMealAnalysis)
    }

    const response = await fetch(MEAL_ANALYSIS_ENDPOINT, {
      body: JSON.stringify(payload),
      headers: {
        Authorization: auth.authorizationHeader,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error?.safeMessage || data.error || 'Kunde inte analysera måltiden just nu.')
    }

    if (!(await hasSameAiAuthUser(auth.userScope))) {
      return normalizeMealAnalysis(fallbackMealAnalysis)
    }

    return normalizeMealAnalysis({
      ...data.analysis,
      source: data.source === 'openai' ? 'openai' : 'mock',
    })
  } catch {
    return normalizeMealAnalysis(fallbackMealAnalysis)
  }
}
