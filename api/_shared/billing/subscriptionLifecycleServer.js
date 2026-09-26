import { defaultPlanCatalog } from '../../../src/services/billing/planCatalog.js'
import { createDurablePlanActivation } from '../../../src/services/billing/planAssignmentSync.js'
import { createRenewalLifecycle } from '../../../src/services/billing/renewalResult.js'
import { createSubscriptionLifecycle } from '../../../src/services/billing/subscriptionLifecycle.js'
import { createServerPrivilegedSubscriptionAuthority, createServerSubscriptionRpcCaller } from './subscriptionRpcCaller.js'

/**
 * Server lifecycle. Durable mode is explicit. Missing credentials throw
 * before any in-memory authority is constructed. User reads use
 * subscriptionRead.js and quotaRead.js.
 */
export function createServerSubscriptionLifecycle({
  catalog = defaultPlanCatalog,
  client,
  env,
  now = () => new Date(),
} = {}) {
  const callRpc = createServerSubscriptionRpcCaller({ client, env })
  const authority = createServerPrivilegedSubscriptionAuthority({ callRpc, catalog, client, env, now })
  const activation = createDurablePlanActivation({ callRpc })
  const renewals = createRenewalLifecycle({
    now,
    subscriptions: authority.subscriptions,
  })
  return {
    authority,
    lifecycle: createSubscriptionLifecycle({
      activation,
      renewals,
      subscriptions: authority.subscriptions,
    }),
  }
}
