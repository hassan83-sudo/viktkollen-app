export const mealSourceCategories = Object.freeze([
  'manual',
  'photo_analysis',
  'quick_add',
  'template',
  'recipe',
  'planned',
  'imported',
  'unknown',
])

export const nutritionProvenanceKinds = Object.freeze([
  'user_entered',
  'user_confirmed',
  'ai_estimated',
  'derived',
  'imported',
  'missing',
])

const sourceLabels = Object.freeze({
  imported: 'Importerad',
  manual: 'Manuell',
  photo_analysis: 'Fotoanalys',
  planned: 'Planerad',
  quick_add: 'Snabbval',
  recipe: 'Recept',
  template: 'Mall',
  unknown: 'Okänd källa',
})

const nutritionLabels = Object.freeze({
  ai_estimated: 'AI-estimat',
  derived: 'Beräknat från måltid',
  imported: 'Importerad näring',
  missing: 'Näring saknas',
  user_confirmed: 'Bekräftat AI-estimat',
  user_entered: 'Användarangivet',
})

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('sv-SE')
}

function normalizeSourceCategory(value) {
  const text = normalizeText(value)

  if (mealSourceCategories.includes(text)) return text
  if (['photoanalysis', 'photo_analysis', 'fotoanalys', 'foto', 'bildanalys'].includes(text)) return 'photo_analysis'
  if (['snabbval', 'quickadd', 'quick_add', 'favorite', 'favorit'].includes(text)) return 'quick_add'
  if (['mall', 'template'].includes(text)) return 'template'
  if (['recept', 'recipe'].includes(text)) return 'recipe'
  if (['planerad', 'planned', 'mealplan', 'meal_plan'].includes(text)) return 'planned'
  if (['importerad', 'imported', 'import'].includes(text)) return 'imported'
  if (['manuell', 'manual', 'user', 'user_entered'].includes(text)) return 'manual'

  return ''
}

export function inferMealSourceCategory(meal = {}) {
  if (!isObject(meal)) return 'unknown'

  if (meal.photoAnalysis?.source === 'photoAnalysis' || meal.photoAnalysis) return 'photo_analysis'

  const explicit = normalizeSourceCategory(meal.sourceCategory || meal.mealSourceCategory)
  if (explicit) return explicit

  if (meal.sourceType === 'recipe' || meal.recipeId) return 'recipe'
  if (meal.sourceType === 'template' || meal.templateId) return 'template'
  if (meal.planned === true || meal.status === 'planned') return 'planned'

  const source = normalizeSourceCategory(meal.source)
  if (source) return source

  return 'manual'
}

function normalizeNutritionProvenance(value) {
  const text = normalizeText(value)

  if (nutritionProvenanceKinds.includes(text)) return text
  if (['ai_estimate', 'aiestimate', 'photoanalysis'].includes(text)) return 'ai_estimated'
  if (['automatic', 'auto'].includes(text)) return 'derived'
  if (['manual', 'manuell'].includes(text)) return 'user_entered'
  if (['confirmed', 'bekraftad', 'bekräftad'].includes(text)) return 'user_confirmed'
  if (['template', 'mall', 'recipe', 'recept', 'calculated', 'beraknad', 'beräknad'].includes(text)) return 'derived'

  return ''
}

function hasNutritionValue(meal = {}) {
  return ['calories', 'protein', 'carbs', 'carbohydrates', 'fat', 'fiber'].some((field) => {
    const value = Number(meal[field])

    return Number.isFinite(value) && value >= 0
  }) || (isObject(meal.nutritionOverride) && Object.keys(meal.nutritionOverride).length > 0)
}

function hasMealText(meal = {}) {
  return [meal.name, meal.description, meal.text, meal.title, meal.note].some((value) => normalizeText(value))
}

export function inferNutritionProvenance(meal = {}) {
  if (!isObject(meal)) return 'missing'

  const explicit = normalizeNutritionProvenance(meal.nutritionProvenance)
  if (explicit) return explicit

  const photoProvenance = normalizeNutritionProvenance(meal.photoAnalysis?.provenance)
  if (photoProvenance) {
    return photoProvenance === 'user_confirmed' || meal.photoAnalysis?.userEdited === true
      ? 'user_confirmed'
      : photoProvenance
  }

  const sourceCategory = inferMealSourceCategory(meal)
  const nutritionSource = normalizeNutritionProvenance(meal.nutritionSource)
  if (['recipe', 'template', 'quick_add', 'planned'].includes(sourceCategory)) return 'derived'
  if (nutritionSource) {
    if (nutritionSource === 'user_entered' && sourceCategory === 'photo_analysis') {
      return meal.photoAnalysis?.userEdited === true ? 'user_confirmed' : 'ai_estimated'
    }
    if (nutritionSource === 'derived' && sourceCategory === 'manual' && hasNutritionValue(meal)) {
      return 'user_entered'
    }
    if (nutritionSource === 'derived' && !hasNutritionValue(meal) && !hasMealText(meal)) {
      return 'missing'
    }
    return nutritionSource
  }

  if (!hasNutritionValue(meal)) return 'missing'
  if (sourceCategory === 'photo_analysis') return meal.photoAnalysis?.userEdited === true ? 'user_confirmed' : 'ai_estimated'
  if (sourceCategory === 'imported') return 'imported'

  return 'user_entered'
}

export function getMealProvenance(meal = {}) {
  const sourceCategory = inferMealSourceCategory(meal)
  const nutritionProvenance = inferNutritionProvenance(meal)

  return {
    isAiEstimated: nutritionProvenance === 'ai_estimated',
    isUserVerified: ['user_entered', 'user_confirmed'].includes(nutritionProvenance),
    nutritionProvenance,
    nutritionProvenanceLabel: nutritionLabels[nutritionProvenance] || nutritionLabels.missing,
    sourceCategory,
    sourceLabel: sourceLabels[sourceCategory] || sourceLabels.unknown,
  }
}

export function summarizeMealProvenance(meals = []) {
  const counts = {
    aiEstimatedMealCount: 0,
    derivedMealCount: 0,
    importedMealCount: 0,
    missingNutritionMealCount: 0,
    totalMealCount: 0,
    userConfirmedMealCount: 0,
    userEnteredMealCount: 0,
    userVerifiedMealCount: 0,
  }

  ;(Array.isArray(meals) ? meals : []).forEach((meal) => {
    const provenance = getMealProvenance(meal)

    counts.totalMealCount += 1
    if (provenance.nutritionProvenance === 'ai_estimated') counts.aiEstimatedMealCount += 1
    if (provenance.nutritionProvenance === 'derived') counts.derivedMealCount += 1
    if (provenance.nutritionProvenance === 'imported') counts.importedMealCount += 1
    if (provenance.nutritionProvenance === 'missing') counts.missingNutritionMealCount += 1
    if (provenance.nutritionProvenance === 'user_confirmed') counts.userConfirmedMealCount += 1
    if (provenance.nutritionProvenance === 'user_entered') counts.userEnteredMealCount += 1
    if (provenance.isUserVerified) counts.userVerifiedMealCount += 1
  })

  return counts
}

export function describeMealProvenanceSummary(summary = {}) {
  const total = Number(summary.totalMealCount) || 0
  if (!total) return 'Inga måltider loggade.'

  const verified = Number(summary.userVerifiedMealCount) || 0
  const ai = Number(summary.aiEstimatedMealCount) || 0

  return `${verified} av ${total} måltider är användarangivna eller bekräftade. ${ai} bygger på AI-estimat.`
}
