import { getPortionEstimate } from './portionEstimates.js'

export const quantityWords = new Map([
  ['en', 1],
  ['ett', 1],
  ['1', 1],
  ['tva', 2],
  ['tvaa', 2],
  ['två', 2],
  ['2', 2],
  ['tre', 3],
  ['3', 3],
  ['fyra', 4],
  ['4', 4],
  ['fem', 5],
  ['5', 5],
  ['sex', 6],
  ['6', 6],
  ['halv', 0.5],
  ['halvt', 0.5],
])

const unitAliases = {
  dl: 'dl',
  deciliter: 'dl',
  deciliterna: 'dl',
  g: 'gram',
  gram: 'gram',
  gr: 'gram',
  liten: 'size',
  lilla: 'size',
  litet: 'size',
  matsked: 'tablespoon',
  matskedar: 'tablespoon',
  msk: 'tablespoon',
  portion: 'portion',
  portioner: 'portion',
  skiva: 'slice',
  skivor: 'slice',
  stor: 'size',
  stora: 'size',
  stort: 'size',
  st: 'piece',
  styck: 'piece',
  stycken: 'piece',
  tesked: 'teaspoon',
  teskedar: 'teaspoon',
  tsk: 'teaspoon',
}

function parseNumberToken(token) {
  const normalized = String(token || '').toLocaleLowerCase('sv-SE').replace(',', '.')

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    const parsed = Number(normalized)

    return Number.isFinite(parsed) ? parsed : null
  }

  return quantityWords.get(normalized) ?? null
}

export function parseQuantityTokens(tokens) {
  if (!tokens.length) {
    return null
  }

  const last = tokens.at(-1)
  const previous = tokens.at(-2)

  if ((previous === 'en' || previous === 'ett') && (last === 'halv' || last === 'halvt')) {
    return 0.5
  }

  return parseNumberToken(last)
}

function normalizeUnitToken(unit) {
  return unitAliases[String(unit || '').toLocaleLowerCase('sv-SE')] || null
}

function defaultServingGrams(food, size) {
  const estimate = getPortionEstimate(food.id)

  if (size === 'small' && Number.isFinite(estimate.smallPortionGrams)) {
    return estimate.smallPortionGrams
  }

  if (size === 'large' && Number.isFinite(estimate.largePortionGrams)) {
    return estimate.largePortionGrams
  }

  return estimate.defaultPortionGrams || food.defaultPortionGrams
}

export function convertAmountToGrams({ food, quantity = 1, size = null, unit = null }) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0
  }

  const safeQuantity = quantity
  const normalizedUnit = normalizeUnitToken(unit)
  const estimate = getPortionEstimate(food.id)

  if (normalizedUnit === 'gram') {
    return safeQuantity > 0 ? safeQuantity : 0
  }

  if (normalizedUnit === 'dl') {
    return safeQuantity * (estimate.deciliterGrams || 100)
  }

  if (normalizedUnit === 'tablespoon') {
    return safeQuantity * (estimate.tablespoonGrams || 15)
  }

  if (normalizedUnit === 'teaspoon') {
    return safeQuantity * (estimate.teaspoonGrams || 5)
  }

  if (normalizedUnit === 'slice') {
    return safeQuantity * (estimate.sliceGrams || food.defaultPortionGrams)
  }

  if (normalizedUnit === 'piece') {
    return safeQuantity * (estimate.pieceGrams || food.defaultPortionGrams)
  }

  if (safeQuantity !== 1 && Number.isFinite(estimate.pieceGrams)) {
    return safeQuantity * estimate.pieceGrams
  }

  return safeQuantity * defaultServingGrams(food, size)
}

export function getUnitTokens() {
  return Object.keys(unitAliases)
}

export function normalizeUnit(unit) {
  return normalizeUnitToken(unit)
}
