import { supabase } from './supabaseClient.js'
import { normalizePhotoIngredientName } from './nutritionPhotoIngredientMatching.js'

const TABLE = 'nutrition_food_bank'

function toSuggestion(row) {
  if (!row) return null
  return {
    category: row.category || '',
    defaultServing: 100,
    id: `${row.source}:${row.source_food_id}`,
    name: row.name,
    nutritionPer100g: {
      calories: Number(row.calories_per_100g) || 0,
      carbs: Number(row.carbs_per_100g) || 0,
      fat: Number(row.fat_per_100g) || 0,
      protein: Number(row.protein_per_100g) || 0,
    },
    source: row.source || 'nutrition_food_bank',
    sourceFoodId: row.source_food_id,
    sourceVersion: row.source_version,
  }
}

export async function searchNutritionFoodBank(name, { limit = 4 } = {}) {
  const normalizedName = normalizePhotoIngredientName(name)
  if (!supabase || !normalizedName) return []

  // Exact normalized matches are deliberately preferred. This avoids silently
  // treating a visually ambiguous food as a specific database item.
  const exact = await supabase
    .from(TABLE)
    .select('source,source_food_id,source_version,name,category,calories_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g')
    .eq('normalized_name', normalizedName)
    .limit(limit)

  if (!exact.error && exact.data?.length) return exact.data.map(toSuggestion).filter(Boolean)

  // A small prefix fallback helps with labels such as "kokt ris" without
  // downloading the complete reference bank to the phone.
  const prefix = await supabase
    .from(TABLE)
    .select('source,source_food_id,source_version,name,category,calories_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g')
    .like('normalized_name', `${normalizedName}%`)
    .limit(limit)

  if (prefix.error) return []
  return (prefix.data || []).map(toSuggestion).filter(Boolean)
}

export async function buildRemotePhotoIngredientMatchSummary(items = [], { maxSuggestions = 4 } = {}) {
  const matches = await Promise.all(items.map(async (item) => {
    const suggestions = await searchNutritionFoodBank(item?.name, { limit: maxSuggestions })
    const status = suggestions.length === 1
      ? 'normalizedMatch'
      : suggestions.length > 1
        ? 'multipleMatches'
        : 'noMatch'

    return {
      id: item?.id,
      name: item?.name,
      matchedFood: suggestions.length === 1 ? suggestions[0] : null,
      status,
      suggestions,
    }
  }))

  const counts = matches.reduce((summary, match) => {
    summary[match.status] = (summary[match.status] || 0) + 1
    return summary
  }, { exactMatch: 0, multipleMatches: 0, noMatch: 0, normalizedMatch: 0 })

  return { counts, matches }
}
