import { entitlementsFromPlan } from './usageSnapshot.js'

const METERED_QUOTAS = Object.freeze([
  Object.freeze({ feature: 'ai.text.request', key: 'ai_coach' }),
  Object.freeze({ feature: 'food.scan', key: 'food_scan' }),
  Object.freeze({ feature: 'body.scan', key: 'body_scan' }),
  Object.freeze({ feature: 'ai.eye.analysis', key: 'ai_eye' }),
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

export function formatPlanPrice(priceMinor, currency = 'SEK') {
  if (currency !== 'SEK') return null
  const minor = Number(priceMinor)
  if (!Number.isInteger(minor) || minor < 0) return null
  if (minor === 0) return { name: 'Gratis', priceText: 'Gratis' }
  if (minor % 100 !== 0) return null
  const major = minor / 100
  return { name: `${major} kr`, priceText: `${major} kr/mån` }
}

function quotasFromEntitlements(entitlements) {
  const byFeature = new Map(entitlements.map((row) => [row.feature, row]))
  const quotas = []
  for (const item of METERED_QUOTAS) {
    const row = byFeature.get(item.feature)
    const limit = row?.limit_value
    if (!row || row.enabled !== true || row.limit_kind !== 'NUMBER' || !Number.isInteger(limit) || limit < 0) {
      return null
    }
    quotas.push({ key: item.key, limit })
  }
  return quotas
}

function unlimitedFromEntitlements(entitlements) {
  const byFeature = new Map(entitlements.map((row) => [row.feature, row]))
  const unlimited = []
  for (const item of UNLIMITED_FEATURES) {
    if (!item.feature) {
      unlimited.push({ key: item.key })
      continue
    }
    const row = byFeature.get(item.feature)
    if (!row || row.enabled !== true || row.limit_kind !== 'UNLIMITED') continue
    unlimited.push({ key: item.key })
  }
  return unlimited
}

function entitlementsOf(plan) {
  if (Array.isArray(plan.entitlementsFlat)) return plan.entitlementsFlat
  return entitlementsFromPlan(plan)
}

export function buildPlanComparison({ currentPlanId = '', plans = [] } = {}) {
  if (!Array.isArray(plans) || plans.length === 0) return null
  const cards = []
  for (const plan of plans) {
    if (!plan || plan.active === false) continue
    const price = formatPlanPrice(plan.price_minor, plan.currency || 'SEK')
    if (!price) continue
    const quotas = quotasFromEntitlements(entitlementsOf(plan))
    cards.push({
      complimentary: plan.price_minor === 0,
      complete: Array.isArray(quotas),
      current: plan.id === currentPlanId,
      forSale: plan.enabled_for_sale === true,
      name: price.name,
      priceMinor: plan.price_minor,
      priceText: price.priceText,
      quotas: quotas || [],
      unlimited: quotas ? unlimitedFromEntitlements(entitlementsOf(plan)) : [],
    })
  }
  if (cards.length === 0) return null
  cards.sort((left, right) => left.priceMinor - right.priceMinor)
  return {
    plans: cards.map((card) => {
      const { priceMinor, ...publicCard } = card
      void priceMinor
      return publicCard
    }),
  }
}
