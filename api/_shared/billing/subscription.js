import { createQuotaEngine } from '../../../src/services/billing/quotaEngine.js'
import { createSubscriptionAuthority } from '../../../src/services/billing/subscriptionAuthority.js'
import { createSubscriptionAssignmentStore } from '../../../src/services/billing/subscriptionService.js'
import { defaultPlanCatalog } from '../../../src/services/billing/planCatalog.js'

const catalog = defaultPlanCatalog
const authority = createSubscriptionAuthority({ catalog })
const subscriptions = authority.subscriptions
const assignments = createSubscriptionAssignmentStore(subscriptions)
const quota = createQuotaEngine({ assignments, catalog })

export async function getServerSubscription({ user } = {}) {
  return subscriptions.getClientSafe(user?.id || '')
}

export async function inspectQuotaForUser({ feature, unit, user } = {}) {
  return quota.inspectQuota({
    clientClaim: {},
    feature,
    unit,
    userId: user?.id || '',
  })
}

export { subscriptions as subscriptionService }
