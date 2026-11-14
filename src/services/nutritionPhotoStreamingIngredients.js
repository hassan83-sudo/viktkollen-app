/**
 * Early ingredient helpers for food-scan progress.
 * Only surfaces names already present in model output. Never invents foods.
 */

import { getFoodEmoji } from './nutrition/foodEmoji.js'

const GENERIC_ILLUSTRATION = '🍽️'
const NAME_FIELD_RE = /"name"\s*:\s*"((?:\\.|[^"\\])*)"/g

function unescapeJsonString(value) {
  try {
    return JSON.parse(`"${value}"`)
  } catch {
    return String(value || '')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
}

function safeIngredientName(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (!text || /^okänd/i.test(text)) return ''
  return text
}

export function illustrationForIngredientName(name) {
  const safe = safeIngredientName(name)
  if (!safe) return GENERIC_ILLUSTRATION
  return getFoodEmoji(safe) || GENERIC_ILLUSTRATION
}

/**
 * Extract completed item names from a partial compact JSON stream.
 * Only reads inside the "items" array. Ignores incomplete quotes.
 */
export function extractStreamingIngredientNames(partialText = '', previous = []) {
  const source = String(partialText || '')
  const itemsAt = source.search(/"items"\s*:/)
  if (itemsAt < 0) return Array.isArray(previous) ? previous.slice() : []

  const slice = source.slice(itemsAt)
  const found = []
  NAME_FIELD_RE.lastIndex = 0
  let match = NAME_FIELD_RE.exec(slice)
  while (match) {
    const name = safeIngredientName(unescapeJsonString(match[1]))
    if (name && !found.includes(name)) found.push(name)
    match = NAME_FIELD_RE.exec(slice)
  }
  return found.length ? found : (Array.isArray(previous) ? previous.slice() : [])
}

export function toEarlyIngredientViews(names = []) {
  const views = []
  for (const name of Array.isArray(names) ? names : []) {
    const safe = safeIngredientName(name)
    if (!safe) continue
    if (views.some((row) => row.name === safe)) continue
    views.push({
      illustration: illustrationForIngredientName(safe),
      name: safe,
    })
  }
  return views
}

export const nutritionPhotoStreamingInternals = {
  GENERIC_ILLUSTRATION,
  safeIngredientName,
}
