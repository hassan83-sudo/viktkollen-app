import { periodBounds } from './period.js'

const METERED_QUOTAS = Object.freeze([
  Object.freeze({ feature: 'ai.text.request', key: 'ai_coach', unit: 'requests' }),
  Object.freeze({ feature: 'food.scan', key: 'food_scan', unit: 'requests' }),
  Object.freeze({ feature: 'body.scan', key: 'body_scan', unit: 'requests' }),
  Object.freeze({ feature: 'ai.eye.analysis', key: 'ai_eye', unit: 'requests' }),
])

const UNLIMITED_FEATURES = Object.freeze([
  Object.freeze({ feature: 'friend_chat', key: 'friend_chat' }),
  Object.freeze({ feature: 'ai.voice.session', key: 'voice_input' }),
  Object.freeze({ feature: 'tts.request', key: 'speech' }),
  Object.freeze({ feature: 'gps_standard', key: 'gps' }),
  Object.freeze({ feature: 'gps.live.session', key: 'gps_live' }),
  Object.freeze({ feature: null, key: 'sos' }),
  Object.freeze({ feature: 'ai.ear.interpret', key: 'ai_ear' }),
])

export function countReservationUsage(rows = [], {
  feature,
  now = new Date(),
  periodStart,
  unit,
} = {}) {
  const start = new Date(periodStart).getTime()
  const at = now.getTime()
  let used = 0
  for (const row of rows) {
    if (row.feature !== feature || row.unit !== unit) continue
    if (new Date(row.period_start).getTime() !== start) continue
    if (row.status === 'COMMITTED') {
      used += Number.isInteger(row.actual_quantity) ? row.actual_quantity : Number(row.quantity) || 0
    } else if (row.status === 'PENDING') {
      const expires = row.expires_at ? new Date(row.expires_at).getTime() : null
      if (expires == null || expires > at) used += Number(row.quantity) || 0
    }
  }
  return Math.max(0, used)
}

function priceFields(priceMinor) {
  const minor = Number(priceMinor) || 0
  if (minor === 0) {
    return { name: 'Gratis', priceText: '0 kr/mån' }
  }
  if (minor % 100 === 0) {
    const major = minor / 100
    return { name: `${major} kr`, priceText: `${major} kr/mån` }
  }
  return { name: `${minor} öre`, priceText: `${minor} öre/mån` }
}

function numberedQuota(key, limit, used) {
  const safeLimit = Math.max(0, Number(limit) || 0)
  const safeUsed = Math.max(0, Number(used) || 0)
  return {
    key,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - safeUsed),
    used: safeUsed,
  }
}

export function buildUsageSnapshot({
  entitlements = [],
  now = new Date(),
  period,
  plan,
  reservations = [],
} = {}) {
  if (!plan || !period?.period_end || !period?.period_start) return null
  const byFeature = new Map(entitlements.map((row) => [row.feature, row]))
  const quotas = []
  for (const item of METERED_QUOTAS) {
    const row = byFeature.get(item.feature)
    if (!row || row.enabled === false || row.limit_kind !== 'NUMBER' || !Number.isInteger(row.limit_value)) continue
    const used = countReservationUsage(reservations, {
      feature: item.feature,
      now,
      periodStart: period.period_start,
      unit: row.unit || item.unit,
    })
    quotas.push(numberedQuota(item.key, row.limit_value, used))
  }
  const unlimited = []
  for (const item of UNLIMITED_FEATURES) {
    if (!item.feature) {
      unlimited.push({ key: item.key })
      continue
    }
    const row = byFeature.get(item.feature)
    if (!row || row.enabled === false || row.limit_kind !== 'UNLIMITED') continue
    unlimited.push({ key: item.key })
  }
  return {
    period: { end: period.period_end },
    plan: priceFields(plan.price_minor),
    quotas,
    unlimited,
  }
}

export function entitlementsFromPlan(plan) {
  if (!plan?.entitlements) return []
  return Object.values(plan.entitlements).map((entitlement) => ({
    enabled: entitlement.enabled === true,
    feature: entitlement.feature,
    limit_kind: entitlement.limit?.kind || null,
    limit_value: Number.isInteger(entitlement.limit?.value) ? entitlement.limit.value : null,
    unit: entitlement.unit,
  }))
}

export function snapshotForPlan({
  now = new Date(),
  plan,
  reservations = [],
} = {}) {
  if (!plan) return null
  const period = periodBounds(plan.billing_interval || 'month', now)
  return buildUsageSnapshot({
    entitlements: entitlementsFromPlan(plan),
    now,
    period,
    plan,
    reservations,
  })
}
