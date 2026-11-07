import test from 'node:test'
import assert from 'node:assert/strict'
import { foodBankSearchPrefixes, selectFoodBankMatch } from '../src/services/nutritionFoodBankMatcher.js'

const component = { name: 'Kyckling', bankName: 'Kyckling', cookingMethods: [], confidence: 'high', aiPer100: { calories: 160 } }
const row = (name, normalized_name, source, calories = 165) => ({ name, normalized_name, source, source_food_id: '1', source_version: '2018-04', calories_per_100g: calories, protein_per_100g: 30, carbs_per_100g: 0, fat_per_100g: 4 })

test('Swedish lookup also searches USDA English aliases', () => {
  assert.ok(foodBankSearchPrefixes(component).includes('kyckli'))
  assert.ok(foodBankSearchPrefixes(component).includes('chicke'))
})

test('English USDA candidate matches Swedish chicken', () => {
  const match = selectFoodBankMatch(component, [row('Chicken', 'chicken', 'usda_sr_legacy')])
  assert.equal(match.status, 'matched')
  assert.equal(match.food.source, 'usda_sr_legacy')
})

test('Swedish candidate wins an equal-score tie', () => {
  const match = selectFoodBankMatch(component, [row('Chicken', 'chicken', 'usda_sr_legacy'), row('Kyckling', 'kyckling', 'livsmedelsverket')])
  assert.equal(match.status, 'matched')
  assert.equal(match.food.source, 'livsmedelsverket')
})

test('Unrelated English food cannot match', () => {
  assert.equal(selectFoodBankMatch(component, [row('Potato', 'potato', 'usda_sr_legacy')]).status, 'noMatch')
})
