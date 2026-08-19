export const entitlementPlans = Object.freeze({
  FREE: 'free',
  PREMIUM: 'premium',
  TRIAL: 'trial',
})

export const entitlementStatus = Object.freeze({
  ACTIVE: 'active',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
  GRACE_PERIOD: 'grace_period',
  NONE: 'none',
  PAST_DUE: 'past_due',
  TRIALING: 'trialing',
})

export const entitlementFeatures = Object.freeze({
  advancedHistory: 'advancedHistory',
  advancedInsights: 'advancedInsights',
  aiCoach: 'aiCoach',
  bodyAnalysis: 'bodyAnalysis',
  cloudSync: 'cloudSync',
  dataExportImport: 'dataExportImport',
  healthPredictions: 'healthPredictions',
  nutritionBasics: 'nutritionBasics',
  nutritionPhotoAnalysis: 'nutritionPhotoAnalysis',
  weeklyReports: 'weeklyReports',
  weightAndCheckIn: 'weightAndCheckIn',
})

export const freeFeatureLimits = Object.freeze({
  [entitlementFeatures.aiCoach]: 25,
  [entitlementFeatures.bodyAnalysis]: 3,
  [entitlementFeatures.cloudSync]: 0,
  [entitlementFeatures.nutritionPhotoAnalysis]: 5,
})

export const featureAccessPolicy = Object.freeze({
  [entitlementFeatures.weightAndCheckIn]: Object.freeze({ free: true, premium: true, trial: true }),
  [entitlementFeatures.nutritionBasics]: Object.freeze({ free: true, premium: true, trial: true }),
  [entitlementFeatures.aiCoach]: Object.freeze({ free: true, limitKey: 'aiCoachMessages', premium: true, trial: true }),
  [entitlementFeatures.nutritionPhotoAnalysis]: Object.freeze({ free: true, limitKey: 'nutritionAnalyses', premium: true, trial: true }),
  [entitlementFeatures.bodyAnalysis]: Object.freeze({ free: true, limitKey: 'bodyAnalysisScans', premium: true, trial: true }),
  [entitlementFeatures.weeklyReports]: Object.freeze({ free: false, premium: true, trial: true }),
  [entitlementFeatures.healthPredictions]: Object.freeze({ free: false, premium: true, trial: true }),
  [entitlementFeatures.advancedInsights]: Object.freeze({ free: false, premium: true, trial: true }),
  [entitlementFeatures.advancedHistory]: Object.freeze({ free: false, premium: true, trial: true }),
  [entitlementFeatures.cloudSync]: Object.freeze({ free: false, premium: true, trial: true }),
  [entitlementFeatures.dataExportImport]: Object.freeze({ free: true, premium: true, trial: true }),
})

function normalizePlan(value) {
  return Object.values(entitlementPlans).includes(value) ? value : entitlementPlans.FREE
}

function normalizeStatus(value, plan) {
  const status = Object.values(entitlementStatus).includes(value) ? value : entitlementStatus.NONE
  if (plan === entitlementPlans.FREE) return entitlementStatus.NONE
  return status
}

function hasActivePaidStatus(status) {
  return [
    entitlementStatus.ACTIVE,
    entitlementStatus.CANCELED,
    entitlementStatus.GRACE_PERIOD,
    entitlementStatus.TRIALING,
  ].includes(status)
}

function normalizeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

export function createDefaultEntitlementSnapshot({ userId = '' } = {}) {
  return {
    cancelAt: '',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: '',
    currentPeriodStart: '',
    featureOverrides: {},
    plan: entitlementPlans.FREE,
    provider: 'none',
    providerCustomerId: '',
    providerSubscriptionId: '',
    source: 'local-default',
    status: entitlementStatus.NONE,
    syncedAt: '',
    userId: String(userId || ''),
    version: 1,
  }
}

export function normalizeEntitlementSnapshot(value = {}, options = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const plan = normalizePlan(source.plan)
  const status = normalizeStatus(source.status, plan)

  return {
    ...createDefaultEntitlementSnapshot(options),
    cancelAt: typeof source.cancelAt === 'string' ? source.cancelAt : '',
    cancelAtPeriodEnd: source.cancelAtPeriodEnd === true,
    currentPeriodEnd: typeof source.currentPeriodEnd === 'string' ? source.currentPeriodEnd : '',
    currentPeriodStart: typeof source.currentPeriodStart === 'string' ? source.currentPeriodStart : '',
    featureOverrides: source.featureOverrides && typeof source.featureOverrides === 'object'
      ? source.featureOverrides
      : {},
    plan,
    provider: typeof source.provider === 'string' ? source.provider : 'none',
    providerCustomerId: typeof source.providerCustomerId === 'string' ? source.providerCustomerId : '',
    providerSubscriptionId: typeof source.providerSubscriptionId === 'string' ? source.providerSubscriptionId : '',
    source: typeof source.source === 'string' ? source.source : 'local-default',
    status,
    syncedAt: typeof source.syncedAt === 'string' ? source.syncedAt : '',
    userId: String(source.userId || options.userId || ''),
    version: 1,
  }
}

export async function fetchVerifiedEntitlementSnapshot({
  fetchImpl = fetch,
  getAuthorization,
  now = new Date(),
  timeoutMs = 5000,
  userId = '',
} = {}) {
  const fallback = createDefaultEntitlementSnapshot({ userId })

  try {
    const auth = await getAuthorization?.()
    if (!auth?.ok || !auth.authorizationHeader) {
      return {
        entitlement: {
          ...fallback,
          source: 'client-auth-unavailable',
          syncedAt: new Date(now).toISOString(),
        },
        ok: false,
        reason: auth?.errorCode || 'AUTH_REQUIRED',
      }
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null
    let response
    try {
      response = await fetchImpl('/api/entitlements', {
        headers: {
          Authorization: auth.authorizationHeader,
        },
        method: 'GET',
        ...(controller ? { signal: controller.signal } : {}),
      })
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
    const payload = await response.json().catch(() => ({}))

    if (!response.ok || payload?.ok === false) {
      return {
        entitlement: {
          ...fallback,
          source: 'server-fetch-failed',
          syncedAt: new Date(now).toISOString(),
        },
        ok: false,
        reason: payload?.error?.code || `HTTP_${response.status}`,
      }
    }

    const entitlement = normalizeEntitlementSnapshot(payload.entitlement, {
      userId: auth.userScope || userId,
    })
    if (auth.userScope && entitlement.userId && entitlement.userId !== auth.userScope) {
      return {
        entitlement: {
          ...fallback,
          source: 'stale-user-scope',
          syncedAt: new Date(now).toISOString(),
        },
        ok: false,
        reason: 'STALE_USER_SCOPE',
      }
    }

    return {
      entitlement,
      ok: true,
      verification: payload.verification || 'server_verified',
    }
  } catch (error) {
    return {
      entitlement: {
        ...fallback,
        source: 'network-fallback-free',
        syncedAt: new Date(now).toISOString(),
      },
      ok: false,
      reason: error?.name === 'AbortError' ? 'FETCH_TIMEOUT' : 'NETWORK_FAILURE',
    }
  }
}

export function getFeatureAccess(snapshot, feature, {
  devPreviewEnabled = false,
  now = new Date(),
  usage = {},
} = {}) {
  const entitlement = normalizeEntitlementSnapshot(snapshot)
  const policy = featureAccessPolicy[feature]
  if (!policy) {
    return {
      allowed: false,
      feature,
      reason: 'unknown_feature',
    }
  }

  const override = entitlement.featureOverrides?.[feature]
  if (override === true) {
    return { allowed: true, feature, reason: 'feature_override' }
  }
  if (override === false) {
    return { allowed: false, feature, reason: 'feature_override_denied' }
  }

  const periodEnd = entitlement.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd) : null
  const isExpiredByPeriod = periodEnd instanceof Date &&
    !Number.isNaN(periodEnd.getTime()) &&
    periodEnd.getTime() <= new Date(now).getTime()
  const isPaidPlan = entitlement.plan === entitlementPlans.PREMIUM || entitlement.plan === entitlementPlans.TRIAL
  const hasPaidAccess = isPaidPlan && hasActivePaidStatus(entitlement.status) && !isExpiredByPeriod

  if (hasPaidAccess && policy[entitlement.plan]) {
    return { allowed: true, feature, reason: entitlement.plan }
  }

  if (!policy.free) {
    return {
      allowed: false,
      feature,
      reason: hasPaidAccess ? 'not_in_plan' : 'premium_required',
    }
  }

  const limit = freeFeatureLimits[feature]
  if (!Number.isFinite(limit)) {
    return { allowed: true, feature, reason: 'free' }
  }

  const used = normalizeNumber(usage[policy.limitKey])
  if (used < limit) {
    return {
      allowed: true,
      feature,
      limit,
      remaining: Math.max(0, limit - used),
      reason: 'free_limit',
      used,
    }
  }

  if (devPreviewEnabled && import.meta.env.DEV) {
    return {
      allowed: true,
      feature,
      limit,
      remaining: 0,
      reason: 'dev_preview',
      used,
    }
  }

  return {
    allowed: false,
    feature,
    limit,
    remaining: 0,
    reason: 'free_limit_reached',
    used,
  }
}

export function buildRecommendedPremiumModel() {
  return {
    free: [
      entitlementFeatures.weightAndCheckIn,
      entitlementFeatures.nutritionBasics,
      entitlementFeatures.aiCoach,
      entitlementFeatures.nutritionPhotoAnalysis,
      entitlementFeatures.bodyAnalysis,
      entitlementFeatures.dataExportImport,
    ],
    premium: [
      entitlementFeatures.weeklyReports,
      entitlementFeatures.healthPredictions,
      entitlementFeatures.advancedInsights,
      entitlementFeatures.advancedHistory,
      entitlementFeatures.cloudSync,
    ],
    trial: [
      entitlementFeatures.weeklyReports,
      entitlementFeatures.healthPredictions,
      entitlementFeatures.advancedInsights,
      entitlementFeatures.cloudSync,
    ],
  }
}
