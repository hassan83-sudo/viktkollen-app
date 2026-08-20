import { normalizeNutritionPhotoAnalysis } from './nutritionPhotoAnalysis.js'

function safeText(value, fallback = '', max = 160) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function estimateByImageSize(metadata = {}) {
  const sizeBytes = Number(metadata.sizeBytes || 0)
  const dimensions = safeText(metadata.dimensions)
  const pixelMatch = dimensions.match(/(\d+)\s*x\s*(\d+)/i)
  const pixels = pixelMatch ? Number(pixelMatch[1]) * Number(pixelMatch[2]) : 0

  if (sizeBytes > 2_500_000 || pixels > 2_000_000) {
    return {
      confidence: 'low',
      portion: { gramsMin: 300, gramsMax: 650, description: 'Okänd tallrik, möjlig normal till stor portion' },
      nutrition: {
        calories: { min: 320, max: 780, midpoint: 550, confidence: 'low' },
        carbsG: { min: 25, max: 95, midpoint: 60, confidence: 'low' },
        fatG: { min: 8, max: 35, midpoint: 20, confidence: 'low' },
        fiberG: { min: 2, max: 12, midpoint: 6, confidence: 'low' },
        proteinG: { min: 12, max: 55, midpoint: 30, confidence: 'low' },
      },
    }
  }

  return {
    confidence: 'low',
    portion: { gramsMin: 200, gramsMax: 520, description: 'Okänd tallrik, möjlig liten till normal portion' },
    nutrition: {
      calories: { min: 220, max: 650, midpoint: 430, confidence: 'low' },
      carbsG: { min: 15, max: 80, midpoint: 48, confidence: 'low' },
      fatG: { min: 5, max: 30, midpoint: 16, confidence: 'low' },
      fiberG: { min: 1, max: 10, midpoint: 5, confidence: 'low' },
      proteinG: { min: 8, max: 45, midpoint: 24, confidence: 'low' },
    },
  }
}

export function createLocalNutritionPhotoEstimate(input = {}, options = {}) {
  const imageMetadata = input.imageMetadata || {}
  const estimate = estimateByImageSize(imageMetadata)
  const mealType = safeText(input.mealType, 'Måltid', 40)

  return normalizeNutritionPhotoAnalysis({
    analysisDate: options.analysisDate,
    confidence: 'low',
    components: [
      {
        category: 'unknown',
        confidence: 'low',
        id: 'local-photo-component-1',
        name: `${mealType} från foto`,
        nutritionEstimate: estimate.nutrition,
        portionEstimate: {
          confidence: estimate.confidence,
          description: estimate.portion.description,
          gramsMax: estimate.portion.gramsMax,
          gramsMin: estimate.portion.gramsMin,
        },
        uncertainty: {
          confidence: 'low',
          reason: 'Lokal fallback tolkar inte synliga ingredienser.',
        },
        visualEvidence: 'Bildmetadata finns, men ingen remote bildtolkning har körts.',
      },
    ],
    detectedItems: [
      {
        calories: estimate.nutrition.calories.midpoint,
        carbohydrates: estimate.nutrition.carbsG.midpoint,
        confidence: 'low',
        dataSource: 'aiEstimate',
        estimatedAmount: Math.round((estimate.portion.gramsMin + estimate.portion.gramsMax) / 2),
        fat: estimate.nutrition.fatG.midpoint,
        name: `${mealType} från foto`,
        notes: 'Lokal uppskattning utan fjärr-AI. Justera efter vad bilden faktiskt visar.',
        protein: estimate.nutrition.proteinG.midpoint,
        unit: 'g',
        uncertain: true,
      },
    ],
    estimatedNutrition: estimate.nutrition,
    portionEstimate: {
      confidence: estimate.confidence,
      description: estimate.portion.description,
      gramsMax: estimate.portion.gramsMax,
      gramsMin: estimate.portion.gramsMin,
    },
    ingredients: [
      {
        confidence: 'low',
        estimatedAmount: `${estimate.portion.gramsMin}-${estimate.portion.gramsMax} g`,
        name: 'Synlig måltid',
        notes: 'Lokal fallback kan inte identifiera ingredienser säkert.',
      },
    ],
    uncertainIngredients: [
      {
        confidence: 'low',
        name: 'Ingredienser och tillagning',
        reason: 'Lokal uppskattning saknar remote bildtolkning och använder bara försiktiga intervall.',
      },
    ],
    analysisQuality: {
      confidence: 'low',
      limitations: [
        'Lokal uppskattning använder bildmetadata och generella intervall, inte faktisk AI-bildtolkning.',
        'Ingredienser, sås, olja och portionsstorlek måste granskas manuellt.',
      ],
      summary: 'Lokal fallback klar med låg confidence.',
    },
    imageMetadata,
    limitations: [
      'Detta är en lokal fallback, inte remote AI-analys.',
      'Värdena är breda intervall och ska granskas innan sparning.',
    ],
    provider: { label: 'Lokal uppskattning', type: 'local' },
    safeSummary: 'Lokal uppskattning skapad från den valda bildens metadata. Granska och justera innan du sparar.',
    sourceType: 'photo',
    warnings: ['Låg confidence: kontrollera måltiden manuellt.'],
  }, options)
}
