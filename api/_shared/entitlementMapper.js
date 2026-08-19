import {
  createDefaultEntitlementSnapshot,
  entitlementPlans,
  entitlementStatus,
  normalizeEntitlementSnapshot,
} from '../../src/services/entitlements.js'

function toIsoString(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function isExpired(value, now = new Date()) {
  const iso = toIsoString(value)
  return Boolean(iso && new Date(iso).getTime() <= new Date(now).getTime())
}

function isKnownPaidStatus(status) {
  return [
    entitlementStatus.ACTIVE,
    entitlementStatus.CANCELED,
    entitlementStatus.GRACE_PERIOD,
    entitlementStatus.TRIALING,
  ].includes(status)
}

export function mapEntitlementRowToSnapshot(row, {
  now = new Date(),
  source = 'server-verified',
  userId = '',
} = {}) {
  if (!row || typeof row !== 'object') {
    return {
      ...createDefaultEntitlementSnapshot({ userId }),
      source: 'server-default',
      syncedAt: new Date(now).toISOString(),
    }
  }

  const snapshot = normalizeEntitlementSnapshot({
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    currentPeriodEnd: toIsoString(row.current_period_end),
    currentPeriodStart: toIsoString(row.current_period_start),
    plan: row.plan,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    source,
    status: row.status,
    syncedAt: new Date(now).toISOString(),
    userId: row.user_id || userId,
  }, { userId })

  const paidPlan = snapshot.plan === entitlementPlans.PREMIUM || snapshot.plan === entitlementPlans.TRIAL
  if (!paidPlan || !isKnownPaidStatus(snapshot.status) || isExpired(snapshot.currentPeriodEnd, now)) {
    return {
      ...createDefaultEntitlementSnapshot({ userId }),
      source,
      syncedAt: new Date(now).toISOString(),
    }
  }

  return snapshot
}

export const entitlementMapperInternals = {
  isExpired,
  isKnownPaidStatus,
  toIsoString,
}
