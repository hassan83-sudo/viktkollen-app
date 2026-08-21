const foodDisplayEntries = [
  ['french fries', 'Pommes frites'],
  ['fried chicken', 'Friterad kyckling'],
  ['fries', 'Pommes frites'],
  ['lemon wedge', 'Citronklyfta'],
  ['picklade grönsaker', 'Inlagda grönsaker'],
  ['pickled vegetables', 'Inlagda grönsaker'],
]

const portionDisplayEntries = [
  ['large portion', 'Stor portion'],
  ['medium lunch portion', 'Normal lunchportion'],
  ['medium portion', 'Normal portion'],
  ['small portion', 'Liten portion'],
]

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sv-SE')
    .replace(/\s+/g, ' ')
    .trim()
}

const foodDisplayNames = new Map(foodDisplayEntries.map(([source, display]) => [normalizeKey(source), display]))
const portionDisplayNames = new Map(portionDisplayEntries.map(([source, display]) => [normalizeKey(source), display]))

export function getNutritionPhotoFoodDisplayName(value = '') {
  const original = String(value || '').trim()
  return foodDisplayNames.get(normalizeKey(original)) || original
}

export function getNutritionPhotoPortionDisplayName(value = '') {
  const original = String(value || '').trim()
  return portionDisplayNames.get(normalizeKey(original)) || original
}

export function getNutritionPhotoDisplayText(value = '') {
  return foodDisplayEntries.reduce((text, [source, display]) => (
    text.replace(new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), display)
  ), String(value || '').trim())
}

export const nutritionPhotoDisplayInternals = {
  foodDisplayNames,
  foodDisplayEntries,
  normalizeKey,
  portionDisplayNames,
  portionDisplayEntries,
}
