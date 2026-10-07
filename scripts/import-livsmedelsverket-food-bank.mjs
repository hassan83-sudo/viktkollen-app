#!/usr/bin/env node

/**
 * Import Livsmedelsverket's official Livsmedelsdatabas into nutrition_food_bank.
 *
 * Confirmed against the live API and its OpenAPI document on 2026-10-07:
 *   GET https://dataportal.livsmedelsverket.se/livsmedel/api/v1/api-info
 *   GET /api/v1/livsmedel?offset&limit&sprak=1  -> { _meta, livsmedel }
 *   GET /api/v1/livsmedel/{nummer}/naringsvarden?sprak=1 -> Naringsvarde[]
 *
 * Food fields used: nummer, namn, version.
 * Nutrient fields used: euroFIRkod, namn, varde, enhet. viktGram is 100.
 * The list object has no food-group field, so category is left empty.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-livsmedelsverket-food-bank.mjs
 */

const API_BASE = process.env.LIVSMEDELSVERKET_API_BASE
  || 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1'
const SOURCE = 'livsmedelsverket'
const PAGE_SIZE = 100
const LANGUAGE = 1

const NUTRIENT_NAMES = {
  calories: ['energi (kcal)'],
  protein: ['protein'],
  carbs: ['kolhydrater, tillgängliga', 'kolhydrater'],
  fat: ['fett, totalt', 'fett'],
  fiber: ['fiber'],
  salt: ['salt, nacl', 'salt'],
}

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\b(och|med|utan|lite|mycket|ca|cirka)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Livsmedelsverket API ${response.status}: ${url}`)
  return response.json()
}

function foodsFromPage(payload) {
  if (!payload || !Array.isArray(payload.livsmedel)) {
    throw new Error('Livsmedelsverket list response did not contain a livsmedel array')
  }
  return payload.livsmedel
}

function nutrientsFromPayload(payload) {
  if (!Array.isArray(payload)) {
    throw new Error('Livsmedelsverket naringsvarden response was not an array')
  }
  return payload
}

function readNutrientValue(row) {
  if (!row || row.varde === null || row.varde === undefined || row.varde === '') return null
  const parsed = Number(row.varde)
  return Number.isFinite(parsed) ? parsed : null
}

function findNutrient(rows, { code, unit, names }) {
  const byCode = rows.find((row) => {
    if (row?.euroFIRkod !== code) return false
    if (!unit) return true
    return String(row.enhet || '').toLocaleLowerCase('sv-SE') === unit
  })
  if (byCode) return byCode
  const wanted = new Set(names)
  return rows.find((row) => wanted.has(String(row?.namn || '').toLocaleLowerCase('sv-SE'))) || null
}

export function mapFoodRecord(food, nutrients, apiReleased) {
  if (food?.nummer === undefined || food?.nummer === null || !food?.namn) return null
  const sourceVersion = food.version || apiReleased
  if (!sourceVersion) {
    throw new Error(`Livsmedel ${food.nummer} has no version and api-info has no apiReleased`)
  }
  const rows = nutrientsFromPayload(nutrients)
  return {
    source: SOURCE,
    source_food_id: String(food.nummer),
    source_version: String(sourceVersion),
    name: String(food.namn),
    normalized_name: normalizeName(food.namn),
    category: null,
    calories_per_100g: readNutrientValue(findNutrient(rows, { code: 'ENERC', unit: 'kcal', names: NUTRIENT_NAMES.calories })),
    protein_per_100g: readNutrientValue(findNutrient(rows, { code: 'PROT', names: NUTRIENT_NAMES.protein })),
    carbs_per_100g: readNutrientValue(findNutrient(rows, { code: 'CHO', names: NUTRIENT_NAMES.carbs })),
    fat_per_100g: readNutrientValue(findNutrient(rows, { code: 'FAT', names: NUTRIENT_NAMES.fat })),
    fiber_per_100g: readNutrientValue(findNutrient(rows, { code: 'FIBT', names: NUTRIENT_NAMES.fiber })),
    salt_per_100g: readNutrientValue(findNutrient(rows, { code: 'NACL', names: NUTRIENT_NAMES.salt })),
    source_payload: { food, nutrients: rows },
  }
}

async function upsert(supabaseUrl, serviceRoleKey, rows) {
  if (!rows.length) return
  const response = await fetch(`${supabaseUrl}/rest/v1/nutrition_food_bank?on_conflict=source,source_food_id,source_version`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!response.ok) throw new Error(`Supabase import failed ${response.status}: ${await response.text()}`)
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await mapper(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function mapFood(food, apiReleased) {
  const nutrients = nutrientsFromPayload(await getJson(
    `${API_BASE}/livsmedel/${encodeURIComponent(food.nummer)}/naringsvarden?sprak=${LANGUAGE}`,
  ))
  return mapFoodRecord(food, nutrients, apiReleased)
}

export async function importLivsmedelsverketFoodBank({ supabaseUrl, serviceRoleKey, onBatch, startOffset = 0 } = {}) {
  const apiInfo = await getJson(`${API_BASE}/api-info`)
  if (!apiInfo?.apiReleased) throw new Error('Livsmedelsverket api-info did not include apiReleased')

  let offset = startOffset
  let imported = 0
  let totalRecords = null

  while (true) {
    const pagePayload = await getJson(`${API_BASE}/livsmedel?offset=${offset}&limit=${PAGE_SIZE}&sprak=${LANGUAGE}`)
    const foods = foodsFromPage(pagePayload)
    if (totalRecords === null) totalRecords = Number(pagePayload?._meta?.totalRecords)
    if (!foods.length) {
      if (Number.isFinite(totalRecords) && offset < totalRecords) {
        throw new Error(`Livsmedelsverket returned an empty page at offset ${offset} before ${totalRecords} records`)
      }
      break
    }

    const mapped = await mapPool(foods, 8, (food) => mapFood(food, apiInfo.apiReleased))
    const batch = mapped.filter(Boolean)

    if (onBatch) await onBatch(batch)
    else await upsert(supabaseUrl, serviceRoleKey, batch)
    imported += batch.length
    console.log(`Imported ${imported} official foods`)

    offset += foods.length
    if (foods.length < PAGE_SIZE) break
    if (Number.isFinite(totalRecords) && offset >= totalRecords) break
  }

  return { imported, apiReleased: apiInfo.apiReleased }
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('import-livsmedelsverket-food-bank.mjs')

if (isDirectRun) {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  const result = await importLivsmedelsverketFoodBank({ supabaseUrl, serviceRoleKey })
  console.log(`Done. Imported ${result.imported} rows from Livsmedelsverket (apiReleased ${result.apiReleased}).`)
}
