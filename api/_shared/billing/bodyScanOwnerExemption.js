// Obegränsad kroppsscanning (body.scan) för ägarens administratörskonto.
//
// Samma modell som matscanningens undantag (foodScanOwnerExemption.js).
// Undantaget gäller bara när ALLA villkor är uppfyllda, och prövas på servern
// för varje scanning:
// 1. Serverflaggan BODY_SCAN_OWNER_UNLIMITED är exakt 'true' i den aktuella
//    Vercel-miljön (Preview och Production styrs var för sig).
// 2. Användaren är verifierad via Supabase Auth (JWT) av rutten.
// 3. Användarens verifierade id står i servervariabeln BODY_SCAN_OWNER_USER_IDS
//    (kommaseparerade UUID:n, utan adminrättigheter), eller användaren har
//    ACTIVE billing_admin i billing.admin_permissions, läst via service-role-
//    RPC:n billing.has_billing_admin (BILL-4A). E-post, headers och
//    formulärfält från klienten ignoreras.
// 4. Ett varaktigt dygnstak (rullande 24 h, räknat i billing.usage_events) är
//    inte nått. Skydd mot missbruk och oväntade AI-kostnader.
//
// Allt fel eller osäkerhet ger "inget undantag": vanlig kvot gäller då.
// Rate limit, inloggning, bildsamtycke, kill switches och användningsloggning
// gäller alltid, även för ägaren.

import { QUOTA_STATUS } from '../../../src/services/billing/catalog.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import { lookupBillingAdmin } from './admin.js'
import { BODY_SCAN_BILLING } from './bodyScanLiveBilling.js'
import { withOwnerUnlimitedQuota } from './foodScanOwnerExemption.js'

export { withOwnerUnlimitedQuota }

export const BODY_SCAN_OWNER_FLAG = 'BODY_SCAN_OWNER_UNLIMITED'
export const BODY_SCAN_OWNER_USER_IDS_ENV = 'BODY_SCAN_OWNER_USER_IDS'
export const BODY_SCAN_OWNER_DAILY_CAP_ENV = 'BODY_SCAN_OWNER_DAILY_CAP'
export const BODY_SCAN_OWNER_DAILY_CAP_DEFAULT = 50
export const BODY_SCAN_OWNER_DAILY_CAP_MAX = 200
const DAY_MS = 24 * 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Antal skickade kroppsscanningar sedan `since`.
export async function countBodyScanEventsSince({ client = createSupabaseAdminClient(), since, userId }) {
  if (!client) throw new Error('usage_store_unavailable')
  const { count, error } = await client
    .schema('billing')
    .from('usage_events')
    .select('event_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', BODY_SCAN_BILLING.feature_id)
    .eq('unit', BODY_SCAN_BILLING.unit)
    .gte('occurred_at', since.toISOString())
  if (error) throw error
  if (!Number.isInteger(count)) throw new Error('usage_count_unavailable')
  return count
}

const defaultDeps = Object.freeze({
  countRecentScans: countBodyScanEventsSince,
  isAdmin: lookupBillingAdmin,
})
let deps = defaultDeps

export function setBodyScanOwnerExemptionDepsForTests(overrides = null) {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps
}

export function resolveBodyScanOwnerDailyCap(env = process.env) {
  const value = Number.parseInt(String(env[BODY_SCAN_OWNER_DAILY_CAP_ENV] ?? ''), 10)
  if (!Number.isInteger(value) || value < 1) return BODY_SCAN_OWNER_DAILY_CAP_DEFAULT
  return Math.min(value, BODY_SCAN_OWNER_DAILY_CAP_MAX)
}

/**
 * @param {{userId: string, env?: object, now?: Date}} input userId måste komma från verifierad JWT.
 * @returns {Promise<{exempt: boolean, reason: string, dailyCap?: number, usedLast24h?: number}>}
 */
export async function resolveBodyScanOwnerExemption({ env = process.env, now = new Date(), userId } = {}) {
  if (env[BODY_SCAN_OWNER_FLAG] !== 'true') return { exempt: false, reason: 'disabled' }
  const id = String(userId || '').trim()
  if (!UUID_RE.test(id)) return { exempt: false, reason: 'invalid_user' }

  const allowlisted = String(env[BODY_SCAN_OWNER_USER_IDS_ENV] || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .some((value) => UUID_RE.test(value) && value === id.toLowerCase())
  const admin = allowlisted || await Promise.resolve()
    .then(() => deps.isAdmin(id))
    .catch(() => false)
  if (admin !== true) return { exempt: false, reason: 'not_admin' }

  const dailyCap = resolveBodyScanOwnerDailyCap(env)
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
 * Ägarstatus för visning (kvotläsning och Plan och användning). Samma
 * serverprövning som scanningen. Fel ger null, så att den vanliga kvoten visas.
 */
export async function resolveBodyScanOwnerStatus({ env = process.env, now = new Date(), userId } = {}) {
  const result = await resolveBodyScanOwnerExemption({ env, now, userId })
  if (!result.exempt && result.reason !== 'daily_cap') return null
  return { dailyCap: result.dailyCap, exempt: result.exempt, usedLast24h: result.usedLast24h }
}

// Svar för GET /api/billing/quota?feature=body.scan när ägarundantaget gäller.
// Är dygnstaket nått returneras den vanliga kvoten (då gäller månadskvoten).
// Endast "kvar"/"slut" ersätts; avstängd funktion, okänd plan m.m. visas som de är.
export function applyOwnerBodyScanQuota(quota, status) {
  if (!quota || !status?.exempt) return quota
  if (quota.status !== QUOTA_STATUS.ALLOWED && quota.status !== QUOTA_STATUS.DENIED_QUOTA_EXCEEDED) return quota
  return {
    ...quota,
    daily_cap: status.dailyCap,
    limit: null,
    owner_unlimited: true,
    remaining: null,
    status: QUOTA_STATUS.ALLOWED,
    used_last_24h: status.usedLast24h,
  }
}

// Ersätter kroppsscanningens månadskvot i användningsöversikten med ägarstatus.
export function applyOwnerBodyScanStatus(snapshot, status) {
  if (!snapshot || !status || !Array.isArray(snapshot.quotas)) return snapshot
  return {
    ...snapshot,
    quotas: snapshot.quotas.map((row) => (row?.key === 'body_scan'
      ? {
        daily_cap: status.dailyCap,
        key: 'body_scan',
        owner_unlimited: true,
        used_last_24h: status.usedLast24h,
      }
      : row)),
  }
}
