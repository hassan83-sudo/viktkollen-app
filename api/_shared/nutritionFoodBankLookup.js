// Server-side uppslag i Livsmedelsverkets matbank (public.nutrition_food_bank).
// Ett enda PostgREST-anrop per scanning, med användarens egen session så att
// tabellens RLS (endast läsning för inloggade) gäller. Ingen service-nyckel.
// Fel eller saknad konfiguration ger tomt resultat: analysen fortsätter då med
// AI:ns tydligt märkta reservvärden.

import { foodBankSearchPrefixes, selectFoodBankMatch } from '../../src/services/nutritionFoodBankMatcher.js'

const SELECT = 'source,source_food_id,source_version,name,normalized_name,calories_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g'
export const FOOD_BANK_LOOKUP_TIMEOUT_MS = 2500
export const FOOD_BANK_MAX_ROWS = 400

function supabaseConfig(env) {
  return {
    anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
  }
}

export async function fetchFoodBankCandidates(components = [], {
  accessToken = '',
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = FOOD_BANK_LOOKUP_TIMEOUT_MS,
} = {}) {
  const { anonKey, url } = supabaseConfig(env)
  const prefixes = [...new Set(components.flatMap((component) => foodBankSearchPrefixes(component)))]
    // Endast a-z/0-9 efter normalisering; inga specialtecken når filtret.
    .filter((prefix) => /^[a-z0-9]{3,}$/.test(prefix))
    .slice(0, 16)
  if (!anonKey || !url || !accessToken || !prefixes.length) {
    return { ok: false, reason: !prefixes.length ? 'no_terms' : 'not_configured', rows: [] }
  }

  const query = new URL('/rest/v1/nutrition_food_bank', url)
  query.searchParams.set('select', SELECT)
  query.searchParams.set('or', `(${prefixes.map((prefix) => `normalized_name.like.${prefix}*`).join(',')})`)
  query.searchParams.set('limit', String(FOOD_BANK_MAX_ROWS))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(query, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      method: 'GET',
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, reason: `http_${response.status}`, rows: [] }
    const rows = await response.json()
    return { ok: true, reason: '', rows: Array.isArray(rows) ? rows : [] }
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network', rows: [] }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Matchar varje komponent mot matbanken. Returnerar en karta id -> matchresultat.
 */
export async function matchComponentsToFoodBank(components = [], options = {}) {
  const lookup = await fetchFoodBankCandidates(components, options)
  const matches = new Map()
  for (const component of components) {
    matches.set(component.id, lookup.ok
      ? selectFoodBankMatch(component, lookup.rows)
      : { food: null, reason: `lookup_${lookup.reason}`, status: 'unavailable', suggestions: [] })
  }
  return { lookup: { ok: lookup.ok, reason: lookup.reason, rowCount: lookup.rows.length }, matches }
}
