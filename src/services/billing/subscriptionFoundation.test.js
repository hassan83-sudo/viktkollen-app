import { afterEach, describe, expect, it } from 'vitest'
import { QUOTA_STATUS, SUBSCRIPTION_STATUS } from './catalog.js'
import { resolveEffectivePlan } from './effectivePlan.js'
import { defaultPlanCatalog, getPlanById } from './planCatalog.js'
import { createQuotaEngine } from './quotaEngine.js'
import { allowedSubscriptionTransitions, assertSubscriptionTransition } from './subscriptionState.js'
import {
  createSubscriptionAssignmentStore,
  createSubscriptionService,
} from './subscriptionService.js'
import { createInMemorySubscriptionStore } from './subscriptionStore.js'
import { createInMemoryUsageRepository, setUsageRepositoryForTests } from './usageRepository.js'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PAID = 'plan.prelim.sek.month.19'
const START = '2026-04-01T00:00:00.000Z'
const END = '2026-05-01T00:00:00.000Z'

function serviceAt(iso, extras = {}) {
  const store = extras.store || createInMemorySubscriptionStore()
  const catalog = extras.catalog || defaultPlanCatalog
  return {
    store,
    subscriptions: createSubscriptionService({
      catalog,
      now: () => new Date(iso),
      store,
    }),
  }
}

describe('BILL-3 subscription state machine', () => {
  it('allows documented transitions and blocks terminal reactivation', () => {
    expect(allowedSubscriptionTransitions(SUBSCRIPTION_STATUS.TRIALING)).toEqual([
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.CANCELED,
      SUBSCRIPTION_STATUS.EXPIRED,
      SUBSCRIPTION_STATUS.PAUSED,
    ])
    expect(() => assertSubscriptionTransition('ACTIVE', 'PAST_DUE')).not.toThrow()
    expect(() => assertSubscriptionTransition('PAST_DUE', 'ACTIVE')).not.toThrow()
    expect(() => assertSubscriptionTransition('CANCELED', 'ACTIVE')).toThrow(/illegal_subscription_transition/)
    expect(() => assertSubscriptionTransition('EXPIRED', 'TRIALING')).toThrow(/illegal_subscription_transition/)
    expect(() => assertSubscriptionTransition('EXPIRED', 'EXPIRED')).not.toThrow()
  })
})

describe('BILL-3 trusted create and client authority', () => {
  it('creates a valid ACTIVE subscription', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    const row = await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })
    expect(row.status).toBe('ACTIVE')
    expect(row.plan_id).toBe(PAID)
    expect(row.plan_version).toBe(1)
    expect(row.user_id).toBe(USER)
  })

  it('blocks reversed periods and inactive or unknown plans', async () => {
    const catalog = defaultPlanCatalog.map((plan) => (
      plan.id === PAID ? { ...plan, active: false } : plan
    ))
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z', { catalog })
    await expect(subscriptions.createSubscription({
      current_period_end: START,
      current_period_start: END,
      plan_id: PAID,
      user_id: USER,
    })).rejects.toMatchObject({ code: 'invalid_period' })
    await expect(subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })).rejects.toMatchObject({ code: 'inactive_plan' })
    const live = serviceAt('2026-04-15T12:00:00.000Z').subscriptions
    await expect(live.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: 'plan.does.not.exist',
      user_id: USER,
    })).rejects.toMatchObject({ code: 'unknown_plan' })
  })

  it('blocks a second open subscription for the same user', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })
    await expect(subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: 'plan.prelim.sek.month.09',
      user_id: USER,
    })).rejects.toMatchObject({ code: 'duplicate_active_subscription' })
  })
})

describe('BILL-3 effective plan resolver', () => {
  it('uses baseline when there is no subscription', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    const effective = await subscriptions.resolveForUser(USER, {
      plan_id: PAID,
      status: 'ACTIVE',
      unlimited: true,
    })
    expect(effective.plan_id).toBe('plan.free')
    expect(effective.source).toBe('baseline')
    expect(effective.reason).toBe('NO_SUBSCRIPTION')
  })

  it('keeps entitlement while cancel_at_period_end is true inside the period', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    const row = await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })
    await subscriptions.scheduleCancelAtPeriodEnd({ subscription_id: row.subscription_id })
    const during = await subscriptions.resolveForUser(USER)
    expect(during.plan_id).toBe(PAID)
    expect(during.subscription.cancel_at_period_end).toBe(true)
  })

  it('returns baseline after period_end even if status is still ACTIVE', async () => {
    const store = createInMemorySubscriptionStore()
    const during = createSubscriptionService({
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-04-15T12:00:00.000Z'),
      store,
    })
    await during.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })
    const after = createSubscriptionService({
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      store,
    })
    const effective = await after.resolveForUser(USER, { now: '2099-01-01T00:00:00.000Z', plan_id: PAID })
    expect(effective.plan_id).toBe('plan.free')
  })

  it('does not entitle PAST_DUE without a configured grace window', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      status: SUBSCRIPTION_STATUS.PAST_DUE,
      user_id: USER,
    })
    const effective = await subscriptions.resolveForUser(USER)
    expect(effective.plan_id).toBe('plan.free')
    expect(effective.reason).toBe('NO_SUBSCRIPTION')
  })

  it('entitles PAST_DUE only while past_due_grace_until is in the future', async () => {
    const store = createInMemorySubscriptionStore()
    const during = createSubscriptionService({
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-04-15T12:00:00.000Z'),
      store,
    })
    await during.createSubscription({
      current_period_end: END,
      current_period_start: START,
      past_due_grace_until: '2026-04-20T00:00:00.000Z',
      plan_id: PAID,
      status: SUBSCRIPTION_STATUS.PAST_DUE,
      user_id: USER,
    })
    expect((await during.resolveForUser(USER)).plan_id).toBe(PAID)
    const afterGrace = createSubscriptionService({
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-04-21T00:00:00.000Z'),
      store,
    })
    expect((await afterGrace.resolveForUser(USER)).plan_id).toBe('plan.free')
  })

  it('fail-safes unknown plan ids to baseline', () => {
    const effective = resolveEffectivePlan({
      catalog: defaultPlanCatalog,
      now: new Date('2026-04-15T12:00:00.000Z'),
      subscriptions: [{
        cancel_at_period_end: false,
        current_period_end: END,
        current_period_start: START,
        plan_id: 'plan.ghost',
        plan_version: 1,
        status: 'ACTIVE',
        subscription_id: 'sub-a',
        user_id: USER,
      }],
    })
    expect(effective.plan_id).toBe('plan.free')
    expect(effective.reason).toBe('UNKNOWN_PLAN')
  })

  it('keeps a historical inactive plan reference for an existing entitled row', () => {
    const catalog = defaultPlanCatalog.map((plan) => (
      plan.id === PAID ? { ...plan, active: false } : plan
    ))
    const effective = resolveEffectivePlan({
      catalog,
      now: new Date('2026-04-15T12:00:00.000Z'),
      subscriptions: [{
        cancel_at_period_end: false,
        current_period_end: END,
        current_period_start: START,
        plan_id: PAID,
        plan_version: 1,
        status: 'ACTIVE',
        subscription_id: 'sub-hist',
        user_id: USER,
      }],
    })
    expect(effective.plan_id).toBe(PAID)
    expect(getPlanById(PAID, catalog).active).toBe(false)
  })

  it('picks the later period_end then lower subscription_id on overlap', () => {
    const effective = resolveEffectivePlan({
      catalog: defaultPlanCatalog,
      now: new Date('2026-04-15T12:00:00.000Z'),
      subscriptions: [
        {
          current_period_end: END,
          current_period_start: START,
          plan_id: 'plan.prelim.sek.month.99',
          plan_version: 1,
          status: 'ACTIVE',
          subscription_id: 'sub-b',
          user_id: USER,
        },
        {
          current_period_end: END,
          current_period_start: START,
          plan_id: PAID,
          plan_version: 1,
          status: 'ACTIVE',
          subscription_id: 'sub-a',
          user_id: USER,
        },
      ],
    })
    expect(effective.plan_id).toBe(PAID)
    expect(effective.subscription.subscription_id).toBe('sub-a')
  })
})

describe('BILL-3 transitions, cancel, trial, idempotency', () => {
  it('cancels immediately and drops entitlement', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    const row = await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })
    await subscriptions.transition({
      subscription_id: row.subscription_id,
      to: SUBSCRIPTION_STATUS.CANCELED,
    })
    const effective = await subscriptions.resolveForUser(USER)
    expect(effective.plan_id).toBe('plan.free')
  })

  it('supports trial foundation without activating production trials', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    const row = await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      status: SUBSCRIPTION_STATUS.TRIALING,
      user_id: USER,
    })
    expect(row.status).toBe('TRIALING')
    const effective = await subscriptions.resolveForUser(USER)
    expect(effective.plan_id).toBe(PAID)
  })

  it('replays the same external_event_id without a second row or plan change', async () => {
    const { subscriptions, store } = serviceAt('2026-04-15T12:00:00.000Z')
    const first = await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      external_event_id: 'evt-sub-1',
      plan_id: PAID,
      user_id: USER,
    })
    const replay = await subscriptions.createSubscription({
      current_period_end: '2026-06-01T00:00:00.000Z',
      current_period_start: START,
      external_event_id: 'evt-sub-1',
      plan_id: 'plan.prelim.sek.month.99',
      user_id: USER,
    })
    expect(replay.subscription_id).toBe(first.subscription_id)
    expect(replay.plan_id).toBe(PAID)
    expect(replay.current_period_end).toBe(first.current_period_end)
    expect((await store.listByUser(USER)).length).toBe(1)
    const canceled = await subscriptions.transition({
      external_event_id: 'evt-cancel-1',
      subscription_id: first.subscription_id,
      to: SUBSCRIPTION_STATUS.CANCELED,
    })
    const again = await subscriptions.transition({
      external_event_id: 'evt-cancel-1',
      subscription_id: first.subscription_id,
      to: SUBSCRIPTION_STATUS.ACTIVE,
    })
    expect(again.status).toBe('CANCELED')
    expect(again.subscription_id).toBe(canceled.subscription_id)
    await expect(subscriptions.transition({
      subscription_id: first.subscription_id,
      to: SUBSCRIPTION_STATUS.ACTIVE,
    })).rejects.toMatchObject({ code: 'illegal_subscription_transition' })
  })
})

describe('BILL-3 quota integration and history isolation', () => {
  afterEach(() => {
    setUsageRepositoryForTests(createInMemoryUsageRepository())
  })

  it('feeds BILL-2 quota from the subscription resolver without client plan_id', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })
    const quota = createQuotaEngine({
      assignments: createSubscriptionAssignmentStore(subscriptions),
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-04-15T12:00:00.000Z'),
    })
    const paidLimit = getPlanById(PAID).entitlements['food.scan'].limit.value
    const inspect = await quota.inspectQuota({
      clientClaim: { plan_id: 'plan.free', remaining: 999, unlimited: true },
      feature: 'food.scan',
      unit: 'requests',
      userId: USER,
    })
    expect(inspect.status).toBe(QUOTA_STATUS.ALLOWED)
    expect(inspect.limit).toBe(paidLimit)
    expect(inspect.period_start).toBe(START)
    expect(inspect.period_end).toBe(END)
    const other = await quota.inspectQuota({
      feature: 'food.scan',
      unit: 'requests',
      userId: OTHER,
    })
    expect(other.limit).toBe(getPlanById('plan.free').entitlements['food.scan'].limit.value)
  })

  it('does not delete usage or reservations when a subscription is canceled', async () => {
    const usage = createInMemoryUsageRepository()
    setUsageRepositoryForTests(usage)
    await usage.insert({
      event_id: 'keep-usage',
      event_type: 'food.scan',
      feature: 'food.scan',
      occurred_at: '2026-04-02T00:00:00.000Z',
      quantity: 1,
      unit: 'requests',
      user_id: USER,
    })
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    const row = await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })
    const quota = createQuotaEngine({
      assignments: createSubscriptionAssignmentStore(subscriptions),
      catalog: defaultPlanCatalog,
      now: () => new Date('2026-04-15T12:00:00.000Z'),
      usageRepository: usage,
    })
    const reserved = await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      user: USER,
    })
    await subscriptions.transition({
      subscription_id: row.subscription_id,
      to: SUBSCRIPTION_STATUS.CANCELED,
    })
    expect((await usage.list()).map((event) => event.event_id)).toEqual(['keep-usage'])
    const after = await quota.inspectQuota({
      feature: 'food.scan',
      unit: 'requests',
      userId: USER,
    })
    expect(after.limit).toBe(5)
    expect(reserved.reservation_id).toBeTruthy()
  })
})

describe('BILL-3 client-safe payload', () => {
  it('omits provider references from the client view', async () => {
    const { subscriptions } = serviceAt('2026-04-15T12:00:00.000Z')
    await subscriptions.createSubscription({
      current_period_end: END,
      current_period_start: START,
      plan_id: PAID,
      user_id: USER,
    })
    const safe = await subscriptions.getClientSafe(USER)
    expect(safe.status).toBe('ACTIVE')
    expect(safe.plan_id).toBe(PAID)
    expect(JSON.stringify(safe)).not.toMatch(/provider/)
    expect(JSON.stringify(safe)).not.toMatch(/external_event/)
  })
})
