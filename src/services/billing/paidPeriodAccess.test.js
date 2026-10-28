import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { planIdForSubscription } from './paidPeriod.js'

const sql = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const USER = '11111111-1111-4111-8111-111111111111'
const PAID = 'plan.prelim.sek.month.04'
let db

beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(sql('20260921180000_billing_plan_quota'))
  await db.exec(sql('20260921200000_billing_subscriptions'))
  await db.exec(sql('20261026130000_billing_quota_respects_period_end'))
  // Load the real quota-window schema and reservation function, without the
  // checkout activation/backfill section (not involved in access eligibility).
  const window = sql('20261028110000_billing_one_time_quota_window')
  await db.exec(window.slice(0, window.indexOf('create or replace function billing.activate_verified_one_time_checkout')))
  await db.exec(sql('20261028120000_billing_paid_period_access_guard'))
  await db.query(`insert into billing.plans (plan_id,name,price_minor,currency,billing_interval,version,price_status)
    values ($1,'Test',400,'SEK','month',1,'PRELIMINARY') on conflict do nothing`, [PAID])
  await db.query(`insert into billing.plan_entitlements (plan_id,feature,enabled,limit_kind,limit_value,unit,quota_status)
    values ($1,'food.scan',true,'NUMBER',10,'requests','PRELIMINARY')
    on conflict (plan_id,feature) do update set limit_value=10`, [PAID])
  await db.exec("update billing.plan_entitlements set limit_value=5 where plan_id='plan.free' and feature='food.scan'")
}, 30000)
afterAll(async () => { await db?.close() })

async function setup({ start = '-1 day', end = '29 days', status = 'ACTIVE', grace = null, source = 'server' } = {}) {
  // Fresh local rows, no production or Staging connection.
  await db.exec('truncate billing.subscriptions, billing.user_plan_assignments, billing.quota_reservations, billing.quota_period_locks cascade')
  await db.query(`insert into billing.user_plan_assignments (user_id,plan_id,plan_version,source) values ($1,$2,1,$3)`, [USER, PAID, source])
  await db.query(`insert into billing.subscriptions (subscription_id,user_id,plan_id,plan_version,status,current_period_start,current_period_end,past_due_grace_until,quota_window)
    values ('test-sub',$1,$2,1,$3,now()+$4::interval,now()+$5::interval,
      case when $6::text is null then null else now()+$6::interval end,'subscription')`, [USER, PAID, status, start, end, grace])
}
async function inspect() {
  return (await db.query(`select billing.reserve_quota($1,'food.scan','requests',1,'inspect') as quota`, [USER])).rows[0].quota
}

describe('paid period access in PostgreSQL and display reads', () => {
  it.each([
    ['ACTIVE', '-1 day', '29 days', null, 10],
    ['ACTIVE', '1 day', '31 days', null, 5],
    ['ACTIVE', '-30 days', '0 seconds', null, 5],
    ['PAST_DUE', '-1 day', '29 days', '1 hour', 10],
    ['PAST_DUE', '-1 day', '29 days', '0 seconds', 5],
    ['PAST_DUE', '-1 day', '29 days', null, 5],
    ['PAST_DUE', '-30 days', '0 seconds', '1 hour', 5],
  ])('%s start=%s end=%s grace=%s gives limit %s without a status-view visit', async (status, start, end, grace, limit) => {
    await setup({ status, start, end, grace })
    expect((await inspect()).limit).toBe(limit)
    const subscription = (await db.query('select * from billing.subscriptions')).rows[0]
    const now = (await db.query('select now() as at')).rows[0].at
    expect(planIdForSubscription({ assignedPlanId: PAID, subscription, now })).toBe(limit === 10 ? PAID : 'plan.free')
    expect((await db.query('select plan_id from billing.user_plan_assignments')).rows[0].plan_id).toBe(PAID)
  })
  it('keeps the one-time window at exactly 30 days', async () => {
    await setup()
    const quota = await inspect()
    expect(new Date(quota.period_end) - new Date(quota.period_start)).toBe(30 * 86400000)
  })
  it('preserves manual assignments without a subscription', async () => {
    await setup({ source: 'admin-seed' })
    await db.exec('truncate billing.subscriptions cascade')
    expect((await inspect()).limit).toBe(10)
    expect(planIdForSubscription({ assignedPlanId: PAID, source: 'admin-seed' })).toBe(PAID)
  })
  it('does not expose the helper to clients', async () => {
    const { rows } = await db.query(`select has_function_privilege('anon','billing.open_paid_plan_id(uuid,text)','execute') as anon,
      has_function_privilege('authenticated','billing.open_paid_plan_id(uuid,text)','execute') as authenticated`)
    expect(rows[0]).toEqual({ anon: false, authenticated: false })
  })
})
