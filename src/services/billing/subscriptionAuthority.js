import { createSubscriptionService } from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'

/**
 * Application port for subscription authority.
 * The default implementation is in-memory. A caller may inject another store
 * with the same methods. This module does not open a database connection.
 *
 * Existing SQL RPCs cover create, advance, cancel, undo, terminalize, and
 * next-period plan scheduling. This module does not apply migrations.
 */
export const SUBSCRIPTION_RPC = Object.freeze({
  advancePeriod: 'billing.advance_subscription_period',
  clearCancelAtPeriodEnd: 'billing.clear_cancel_at_period_end',
  createSubscription: 'billing.create_subscription',
  finalizeOpenSubscription: 'billing.finalize_open_subscription',
  scheduleCancelAtPeriodEnd: 'billing.schedule_cancel_at_period_end',
  scheduleNextPeriodPlanChange: 'billing.schedule_next_period_plan_change',
})

export function createSubscriptionAuthority({
  catalog,
  now = () => new Date(),
  store = createInMemorySubscriptionStore(),
} = {}) {
  const subscriptions = createSubscriptionService({ catalog, now, store })
  return {
    read: (subscriptionId) => store.get(subscriptionId),
    store,
    subscriptions,
  }
}

export function createRpcSubscriptionPort(callRpc) {
  async function call(operation, args) {
    const name = SUBSCRIPTION_RPC[operation]
    if (!name) {
      const error = new Error('durable_operation_unavailable')
      error.code = 'durable_operation_unavailable'
      error.operation = operation
      throw error
    }
    return callRpc(name, args)
  }
  return {
    advancePeriod: (args) => call('advancePeriod', args),
    clearCancelAtPeriodEnd: (args) => call('clearCancelAtPeriodEnd', args),
    createSubscription: (args) => call('createSubscription', args),
    finalizeOpenSubscription: (args) => call('finalizeOpenSubscription', args),
    scheduleCancelAtPeriodEnd: (args) => call('scheduleCancelAtPeriodEnd', args),
    scheduleNextPeriodPlanChange: (args) => call('scheduleNextPeriodPlanChange', args),
  }
}
