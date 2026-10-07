#!/usr/bin/env node

/**
 * Import Livsmedelsverket's official Livsmedelsdatabas into nutrition_food_bank.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-livsmedelsverket-food-bank.mjs
 *
 * The importer deliberately stores official nutrient values unchanged. A separate
 * normalized_name is generated only for lookup; it never replaces source data.
 */

const API_BASE = process.env.LIVSMEDELSVERKET_API_BASE
  || 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1'
const SOURCE = 'livsmedelsverket'
const PAGE_SIZE = 100

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Livsmedelsverket API ${response.status}: ${url}`)
  return response.json()
}

function arrayFromResponse(payload) {
  if (Array.isArray(payload)) return payload
  for (const key of ['livsmedel', 'items', 'data', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  return []
}

function valueOf(object, keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key]
  }
  return null
}

function nutrientName(row) {
  return String(valueOf(row, ['namn', 'name', 'naringsamne', 'näringsämne']) || '').toLocaleLowerCase('sv-SE')
}

function nutrientValue(rows, patterns) {
  const hit = rows.find((row) => patterns.some((pattern) => pattern.test(nutrientName(row))))
  const raw = hit ? valueOf(hit, ['varde', 'värde', 'value', 'mangd', 'mängd']) : null
  if (raw === null || raw === '') return null
  const parsed = Number(String(raw).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

async function upsert(rows) {
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

const apiInfo = await getJson(`${API_BASE}/api-info`)
const sourceVersion = String(
  valueOf(apiInfo, ['releasedatum', 'releaseDate', 'version', 'released']) || 'official-api'
)

let offset = 0
let imported = 0

while (true) {
  const pagePayload = await getJson(`${API_BASE}/livsmedel?offset=${offset}&limit=${PAGE_SIZE}`)
  const foods = arrayFromResponse(pagePayload)
  if (!foods.length) break

  const batch = []
  for (const food of foods) {
    const sourceFoodId = valueOf(food, ['nummer', 'id', 'livsmedelsnummer'])
    const name = valueOf(food, ['namn', 'name', 'livsmedelsnamn'])
    if (sourceFoodId === null || !name) continue

    const nutrientPayload = await getJson(`${API_BASE}/livsmedel/${encodeURIComponent(sourceFoodId)}/naringsvarden`)
    const nutrients = arrayFromResponse(nutrientPayload)

    batch.push({
      source: SOURCE,
      source_food_id: String(sourceFoodId),
      source_version: sourceVersion,
      name: String(name),
      normalized_name: normalizeName(name),
      category: valueOf(food, ['livsmedelsgrupp', 'kategori', 'category']),
      calories_per_100g: nutrientValue(nutrients, [/energi.*kcal/, /kilokalori/]),
      protein_per_100g: nutrientValue(nutrients, [/protein/]),
      carbs_per_100g: nutrientValue(nutrients, [/kolhydrat/]),
      fat_per_100g: nutrientValue(nutrients, [/^fett/, /fett, totalt/]),
      fiber_per_100g: nutrientValue(nutrients, [/fiber/]),
      salt_per_100g: nutrientValue(nutrients, [/salt/, /nacl/]),
      source_payload: { food, nutrients },
    })
  }

  await upsert(batch)
  imported += batch.length
  console.log(`Imported ${imported} official foods`)

  if (foods.length < PAGE_SIZE) break
  offset += foods.length
}

console.log(`Done. Imported ${imported} rows from Livsmedelsverket (${sourceVersion}).`)
