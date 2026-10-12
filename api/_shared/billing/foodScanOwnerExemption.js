// Obegränsad matscanning (food.scan) för ägarens administratörskonto.
//
// Undantaget gäller bara när ALLA villkor är uppfyllda, och prövas på servern
// för varje scanning:
// 1. Serverflaggan FOOD_SCAN_OWNER_UNLIMITED är exakt 'true' i den aktuella
//    Vercel-miljön (Preview och Production styrs var för sig).
// 2. Användaren är verifierad via Supabase Auth (JWT) av rutten.
// 3. Användaren har ACTIVE billing_admin i billing.admin_permissions, läst via
//    service-role-RPC:n billing.has_billing_admin (BILL-4A). Tabellen går inte
//    att läsa eller skriva för klienter, och ingen app-väg kan ge behörigheten.
// 4. Ett varaktigt dygnstak (rullande 24 h, räknat i billing.usage_events) är
//    inte nått. Skydd mot missbruk och oväntade API-kostnader.
//
// Allt fel eller osäkerhet ger "inget undantag": vanlig kvot gäller då.
// Rate-limit per rutt, kill switches och användningsloggning gäller som vanligt.

import { QUOTA_STATUS } from '../../../src/services/billing/catalog.js'
import { FOOD_SCAN_CANARY } from '../../../src/services/billing/foodScanCanary.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import { lookupBillingAdmin } from './admin.js'

export const FOOD_SCAN_OWNER_FLAG = 'FOOD_SCAN_OWNER_UNLIMITED'
export const FOOD_SCAN_OWNER_DAILY_CAP_ENV = 'FOOD_SCAN_OWNER_DAILY_CAP'
export const FOOD_SCAN_OWNER_DAILY_CAP_DEFAULT = 100
export const FOOD_SCAN_OWNER_DAILY_CAP_MAX = 500
const DAY_MS = 24 * 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Antal skickade matscanningar sedan `since`.
export async function countFoodScanEventsSince({ client = createSupabaseAdminClient(), since, userId }) {
  if (!client) throw new Error('usage_store_unavailable')
  const { count, error } = await client
    .schema('billing')
    .from('usage_events')
    .select('event_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', FOOD_SCAN_CANARY.feature_id)
    // En 'requests'-händelse per skickad scanning; tokentelemetri har enheten 'tokens'.
    .eq('unit', FOOD_SCAN_CANARY.unit)
    .gte('occurred_at', since.toISOString())
  if (error) throw error
  if (!Number.isInteger(count)) throw new Error('usage_count_unavailable')
  return count
}

const defaultDeps = Object.freeze({
  countRecentScans: countFoodScanEventsSince,
  isAdmin: lookupBillingAdmin,
})
let deps = defaultDeps

export function setFoodScanOwnerExemptionDepsForTests(overrides = null) {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps
}

export function resolveOwnerDailyCap(env = process.env) {
  const value = Number.parseInt(String(env[FOOD_SCAN_OWNER_DAILY_CAP_ENV] ?? ''), 10)
  if (!Number.isInteger(value) || value < 1) return FOOD_SCAN_OWNER_DAILY_CAP_DEFAULT
  return Math.min(value, FOOD_SCAN_OWNER_DAILY_CAP_MAX)
}

/**
 * @param {{userId: string, env?: object, now?: Date}} input userId måste komma från verifierad JWT.
 * @returns {Promise<{exempt: boolean, reason: string, dailyCap?: number, usedLast24h?: number}>}
 */
export async function resolveFoodScanOwnerExemption({ env = process.env, now = new Date(), userId } = {}) {
  if (env[FOOD_SCAN_OWNER_FLAG] !== 'true') return { exempt: false, reason: 'disabled' }
  const id = String(userId || '').trim()
  if (!UUID_RE.test(id)) return { exempt: false, reason: 'invalid_user' }

  const admin = await Promise.resolve()
    .then(() => deps.isAdmin(id))
    .catch(() => false)
  if (admin !== true) return { exempt: false, reason: 'not_admin' }

  const dailyCap = resolveOwnerDailyCap(env)
  let usedLast24h
  try {
    usedLast24h = await deps.countRecentScans({ since: new Date(now.getTime() - DAY_MS), userId: id })
  } catch {
    return { exempt: false, reason: 'cap_unavailable' }
  }
  if (!Number.isInteger(usedLast24h) || usedLast24h < 0) return { exempt: false, reason: 'cap_unavailable' }
  if (usedLast24h >= dailyCap) return { dailyCap, exempt: false, reason: 'daily_cap', usedLast24h }

  return { dailyCap, exempt: true, reason: 'owner_unlimited', usedLast24h }
}

/**
 * Kvot utan månadsgräns för en enda verifierad scanning. Reserveringen blir
 * UNLIMITED (som en obegränsad plan i billing.reserve_quota) och skrivs inte
 * mot månadskvoten.
 */
export function withOwnerUnlimitedQuota(quota) {
  const unlimitedIds = new Set()
  return {
    ...quota,
    // Kontrollsteget går mot riktiga kvotmotorn. Endast "månadskvoten är slut"
    // ersätts; avstängd funktion, okänd plan m.m. stoppar fortfarande.
    async inspectQuota(input = {}) {
      const result = await quota.inspectQuota(input)
      const exhausted = result?.status === QUOTA_STATUS.DENIED_QUOTA_EXCEEDED
        || (result?.status === QUOTA_STATUS.ALLOWED && result.remaining != null)
      return exhausted ? { ...result, remaining: null, status: QUOTA_STATUS.ALLOWED } : result
    },
    async commitReservation(input = {}) {
      if (unlimitedIds.has(input.reservation_id)) {
        return { reservation_id: input.reservation_id, status: QUOTA_STATUS.COMMITTED, used: input.actual_quantity ?? null }
      }
      return quota.commitReservation(input)
    },
    async reserveQuota(input = {}) {
      if (!(Number(input.quantity) > 0) || !input.reservation_id) return quota.reserveQuota(input)
      unlimitedIds.add(input.reservation_id)
      return { limit: 'UNLIMITED', reservation_id: input.reservation_id, status: QUOTA_STATUS.UNLIMITED, unit: input.unit }
    },
    async rollbackReservation(input = {}) {
      if (unlimitedIds.has(input.reservation_id)) {
        return { reservation_id: input.reservation_id, status: QUOTA_STATUS.ROLLED_BACK }
      }
      return quota.rollbackReservation(input)
    },
  }
}
