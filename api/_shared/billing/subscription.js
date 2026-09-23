import { createQuotaEngine } from '../../../src/services/billing/quotaEngine.js'
import {
  createSubscriptionAssignmentStore,
  createSubscriptionService,
} from '../../../src/services/billing/subscriptionService.js'
import { defaultPlanCatalog } from '../../../src/services/billing/planCatalog.js'

const catalog = defaultPlanCatalog
const subscriptions = createSubscriptionService({ catalog })
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
