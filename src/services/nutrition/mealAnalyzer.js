import { getNutritionAliases } from './nutritionDatabase.js'
import {
  buildMealFlags,
  calculateNutritionForGrams,
  sumMealNutrition,
} from './nutritionCalculator.js'
import { calculateProteinGoalContribution } from './nutritionGoals.js'
import {
  convertAmountToGrams,
  getUnitTokens,
  normalizeUnit,
  parseQuantityTokens,
} from './nutritionUnits.js'

const maxTextLength = 1000
const sizeWords = new Map([
  ['liten', 'small'],
  ['lilla', 'small'],
  ['litet', 'small'],
  ['stor', 'large'],
  ['stora', 'large'],
  ['stort', 'large'],
])

const mealTypePatterns = [
  ['frukost', /\bfrukost\b|\btill frukost\b/],
  ['lunch', /\blunch\b|\blunchen\b/],
  ['middag', /\bmiddag\b|\bmiddagen\b|\btill middag\b/],
  ['mellanmål', /\bmellanmal\b|\bmellanmål\b|\bsom mellanmal\b/],
  ['kvällsmål', /\bkvallsmal\b|\bkvällsmål\b|\bsent pa kvallen\b|\bsent på kvällen\b/],
  ['nattmål', /\bnattmal\b|\bnattmål\b|\binnan jag la mig\b|\binnan jag lade mig\b/],
]

const unknownFoodPatterns = [
  ['hemlagad sås', /\bhemlagad sas\b|\bhemlagad sås\b/],
  ['sås', /\bsas\b|\bsås\b/],
  ['okänt livsmedel', /\bokant livsmedel\b|\bokänt livsmedel\b/],
]

function normalizeText(value) {
  return String(value || '')
    .slice(0, maxTextLength)
    .toLocaleLowerCase('sv-SE')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/(?<=\d),(?=\d)/gu, '.')
    .replace(/(?<!\d)\.|\.(?!\d)/gu, ' ')
    .replace(/[^\p{L}\p{N}.\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findMealType(normalized) {
  return mealTypePatterns.find(([, pattern]) => pattern.test(normalized))?.[0] || null
}

function overlaps(span, spans) {
  return spans.some((existing) => span.start < existing.end && span.end > existing.start)
}

function findFoodMatches(normalized) {
  const aliases = getNutritionAliases()
    .map(({ alias, food }) => ({
      alias: normalizeText(alias),
      food,
    }))
    .sort((first, second) => second.alias.length - first.alias.length)
  const spans = []
  const matches = []

  aliases.forEach(({ alias, food }) => {
    const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?:\\s|$)`, 'g')
    let match = pattern.exec(normalized)

    while (match) {
      const start = match.index + match[0].indexOf(alias)
      const end = start + alias.length
      const span = { end, start }

      if (!overlaps(span, spans)) {
        spans.push(span)
        matches.push({
          alias,
          end,
          food,
          start,
        })
      }

      match = pattern.exec(normalized)
    }
  })

  return matches.sort((first, second) => first.start - second.start)
}

function readAmountBefore(normalized, index, food) {
  const before = normalized.slice(0, index).trim()
  const scopedBefore = before
    .split(/\b(?:och|med|samt|plus|darefter|därefter)\b/u)
    .at(-1)
    ?.trim() ?? before
  const tokens = scopedBefore.split(/\s+/).filter(Boolean).slice(-6)
  const unitTokens = new Set(getUnitTokens())
  const unitIndex = tokens.findLastIndex((token) => unitTokens.has(token))
  const sizeToken = [...tokens].reverse().find((token) => sizeWords.has(token))
  const size = sizeToken ? sizeWords.get(sizeToken) : null

  if (unitIndex >= 0) {
    const unit = tokens[unitIndex]
    const quantity = parseQuantityTokens(tokens.slice(Math.max(0, unitIndex - 2), unitIndex)) ?? 1
    const grams = convertAmountToGrams({
      food,
      quantity,
      size,
      unit,
    })

    return {
      grams,
      quantity,
      size,
      unit: normalizeUnit(unit),
    }
  }

  const quantity = parseQuantityTokens(tokens.slice(-2)) ?? 1
  const grams = convertAmountToGrams({
    food,
    quantity,
    size,
  })

  return {
    grams,
    quantity,
    size,
    unit: size ? 'portion' : null,
  }
}

function findUnknownFoods(normalized, matches) {
  const knownSpans = matches.map((match) => ({
    end: match.end,
    start: match.start,
  }))

  return unknownFoodPatterns
    .map(([label, pattern]) => {
      const match = pattern.exec(normalized)

      if (!match) return null

      const start = match.index
      const end = start + match[0].length

      return overlaps({ end, start }, knownSpans) ? null : label
    })
    .filter(Boolean)
}

export function analyzeMealText(message, options = {}) {
  const normalized = normalizeText(message)
  const matches = findFoodMatches(normalized)
  const items = matches
    .map((match) => {
      const amount = readAmountBefore(normalized, match.start, match.food)

      if (!Number.isFinite(amount.grams) || amount.grams <= 0) {
        return null
      }

      return {
        amount,
        food: match.food,
        grams: amount.grams,
        matchedText: match.alias,
        nutrition: calculateNutritionForGrams(match.food, amount.grams),
        quantity: amount.quantity,
      }
    })
    .filter(Boolean)
    .sort((first, second) => first.matchedText.localeCompare(second.matchedText, 'sv-SE'))

  const totals = sumMealNutrition(items)
  const flags = buildMealFlags(items, totals)
  const proteinContribution = calculateProteinGoalContribution(totals.protein, options.proteinGoal)
  const unknownFoods = findUnknownFoods(normalized, matches)

  return {
    estimated: items.length > 0,
    flags,
    items,
    mealType: findMealType(normalized),
    proteinContribution,
    totals,
    unknownFoods,
  }
}

export const mealAnalyzerInternals = {
  normalizeText,
}
