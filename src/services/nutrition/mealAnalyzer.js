import { nutritionFoods } from './nutritionDatabase.js'
import {
  buildMealFlags,
  multiplyFoodNutrition,
  sumMealNutrition,
} from './nutritionCalculator.js'
import { calculateProteinGoalContribution } from './nutritionGoals.js'

const quantityWords = new Map([
  ['en', 1],
  ['ett', 1],
  ['1', 1],
  ['tva', 2],
  ['två', 2],
  ['2', 2],
  ['tre', 3],
  ['3', 3],
  ['fyra', 4],
  ['4', 4],
  ['fem', 5],
  ['5', 5],
])

const mealTypePatterns = [
  ['frukost', /\bfrukost\b/],
  ['lunch', /\blunch\b/],
  ['middag', /\bmiddag\b|\btill middag\b/],
  ['mellanmål', /\bmellanmal\b|\bmellanmål\b/],
  ['kvällsmål', /\bkvallsmal\b|\bkvällsmål\b/],
]

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('sv-SE')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeAlias(value) {
  return normalizeText(value)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findMealType(normalized) {
  return mealTypePatterns.find(([, pattern]) => pattern.test(normalized))?.[0] || null
}

function readQuantityBefore(normalized, index) {
  const before = normalized.slice(0, index).trim().split(/\s+/).slice(-3)
  const lastQuantity = [...before].reverse().find((word) => quantityWords.has(word))

  return lastQuantity ? quantityWords.get(lastQuantity) : 1
}

function findFoodMatch(normalized, food) {
  return food.aliases
    .map((alias) => normalizeAlias(alias))
    .sort((a, b) => b.length - a.length)
    .map((alias) => {
      const match = normalized.match(new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?:\\s|$)`))

      return match
        ? {
            alias,
            index: match.index + match[0].indexOf(alias),
          }
        : null
    })
    .find(Boolean) || null
}

export function analyzeMealText(message, options = {}) {
  const normalized = normalizeText(message)
  const items = nutritionFoods
    .map((food) => {
      const match = findFoodMatch(normalized, food)

      if (!match) return null

      const quantity = readQuantityBefore(normalized, match.index)

      return {
        food,
        matchedText: match.alias,
        nutrition: multiplyFoodNutrition(food, quantity),
        quantity,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.matchedText.localeCompare(b.matchedText, 'sv-SE'))

  const totals = sumMealNutrition(items)
  const flags = buildMealFlags(items, totals)
  const proteinContribution = calculateProteinGoalContribution(totals.protein, options.proteinGoal)

  return {
    flags,
    items,
    mealType: findMealType(normalized),
    proteinContribution,
    totals,
  }
}
