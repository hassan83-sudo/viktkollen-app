import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const sql = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PAID = 'plan.prelim.sek.month.12'
let db
let paidBefore

async function time(at) {
  await db.query("select set_config('trial_test.now', $1, false)", [at])
}
async function start(user = USER) {
  return (await db.query('select to_jsonb(billing.start_account_trial($1)) as trial', [user])).rows[0].trial
}
async function reserve(id, user = USER) {
  return (await db.query("select billing.reserve_quota($1,'food.scan','requests',1,$2) as quota", [user, id])).rows[0].quota
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key, email text, encrypted_password text, is_anonymous boolean);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create or replace function pg_catalog.now() returns timestamptz language sql stable
    as 'select current_setting(''trial_test.now'')::timestamptz';`)
  await time('2026-11-28T10:00:00Z')
  await db.exec(sql('20260921180000_billing_plan_quota'))
  await db.exec(sql('20260921200000_billing_subscriptions'))
  await db.exec(sql('20260926133000_billing_sync_plan_assignment'))
  await db.exec(sql('20261026130000_billing_quota_respects_period_end'))
  const window = sql('20261028110000_billing_one_time_quota_window')
  await db.exec(window.slice(0, window.indexOf('create or replace function billing.activate_verified_one_time_checkout')))
  await db.exec(sql('20261028120000_billing_paid_period_access_guard'))
  await db.exec(`create table billing.checkout_intents(user_id uuid, status text, expires_at timestamptz);
    create table billing.plan_commercial_controls(plan_id text primary key, enabled_for_sale boolean);
    create table public.user_wardrobes(user_id uuid primary key, wardrobe jsonb);
    alter table public.user_wardrobes enable row level security;
    grant usage on schema auth to authenticated;
    grant select,insert,update on public.user_wardrobes to authenticated;
    create policy own_wardrobe on public.user_wardrobes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    update billing.plan_entitlements set limit_value=5 where plan_id='plan.free' and feature='food.scan';
    update billing.plan_entitlements set limit_value=30 where plan_id='${PAID}' and feature='food.scan';`)
  await db.query("insert into auth.users values ($1,'test@example.invalid','password-hash',false),($2,'paid@example.invalid','password-hash',false)", [USER, OTHER])
  await db.query(`select billing.create_subscription($1,$2,'ACTIVE','2026-11-03T10:00:00Z','2026-12-03T10:00:00Z',false,'paid-test')`, [OTHER, PAID])
  await db.query("update billing.subscriptions set provider='sumup',provider_customer_ref='existing-customer',provider_subscription_ref='existing-sub' where user_id=$1", [OTHER])
  paidBefore = (await db.query('select to_jsonb(s) as snapshot from billing.subscriptions s where user_id=$1', [OTHER])).rows[0].snapshot
  await db.exec(sql('20261128092522_account_free_trial'))
}, 30000)

beforeEach(async () => { await db.exec('begin'); await time('2026-11-28T10:00:00Z') })
afterAll(async () => { await db?.close() })
// Each case rolls back its own test account mutations; the migration is shared.
afterEach(async () => { await db.exec('rollback') })

describe('explicit 30-day trial using the real PostgreSQL billing functions', () => {
  it('starts once, without provider details, and preserves the paid renewal row byte for byte', async () => {
    const trial = await start()
    expect(trial).toMatchObject({ status: 'TRIALING', plan_id: 'plan.trial.30days', quota_window: 'subscription', cancel_at_period_end: true, provider: '', provider_customer_ref: '', provider_subscription_ref: '' })
    expect(new Date(trial.current_period_end) - new Date(trial.current_period_start)).toBe(30 * 86400000)
    expect((await db.query('select plan_id from billing.user_plan_assignments where user_id=$1', [USER])).rows[0].plan_id).toBe(trial.plan_id)
    expect((await db.query('select to_jsonb(s) as snapshot from billing.subscriptions s where user_id=$1', [OTHER])).rows[0].snapshot).toEqual(paidBefore)
    await expect(start()).rejects.toThrow('trial_already_used')
  })

  it('allows exactly five shared food/nature reservations across the month boundary without stacking free usage', async () => {
    // Nature's existing server adapter reserves food.scan, the same ledger.
    expect((await reserve('free-before')).status).toBe('RESERVED')
    await db.query("select billing.commit_quota('free-before',1)")
    const trial = await start()
    for (let i = 0; i < 5; i++) {
      if (i === 3) await time('2026-12-01T10:00:00Z')
      const result = await reserve(`mixed-scan-${i}`)
      expect(result.status).toBe('RESERVED')
      expect(result.limit).toBe(5)
      expect(new Date(result.period_start).toISOString()).toBe(new Date(trial.current_period_start).toISOString())
      await db.query('select billing.commit_quota($1,1)', [`mixed-scan-${i}`])
    }
    expect(await reserve('sixth')).toMatchObject({ status: 'DENIED_QUOTA_EXCEEDED', used: 5, remaining: 0 })
    expect((await db.query('select count(*)::int as count from billing.quota_reservations')).rows[0].count).toBe(6)
  })

  it('counts pending reservations atomically and releases a failed scan', async () => {
    await start()
    const outcomes = await Promise.all(Array.from({ length: 7 }, (_, i) => reserve(`pending-${i}`)))
    expect(outcomes.filter((r) => r.status === 'RESERVED')).toHaveLength(5)
    expect(outcomes.filter((r) => r.status === 'DENIED_QUOTA_EXCEEDED')).toHaveLength(2)
    await db.query("select billing.rollback_quota('pending-0')")
    expect((await reserve('replacement')).status).toBe('RESERVED')
  })

  it('falls back to the monthly free pool at the exact expiry without deleting trial history', async () => {
    const trial = await start()
    await reserve('saved-scan')
    await time(trial.current_period_end)
    const free = await reserve('after-expiry')
    expect(free).toMatchObject({ status: 'RESERVED', limit: 5 })
    expect(new Date(free.period_start).toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect((await db.query('select count(*)::int as count from billing.account_trials')).rows[0].count).toBe(1)
    expect((await db.query('select count(*)::int as count from billing.quota_reservations')).rows[0].count).toBe(2)
    await expect(start()).rejects.toThrow('trial_already_used')
  })

  it('retains the paid scan quota and rejects a trial on the existing active subscription', async () => {
    await db.query("insert into billing.user_plan_assignments(user_id,plan_id,plan_version,source) values ($1,$2,1,'server')", [OTHER, PAID])
    expect(await reserve('paid-scan', OTHER)).toMatchObject({ status: 'RESERVED', limit: 30 })
    await expect(start(OTHER)).rejects.toThrow('active_period_exists')
  })

  it('requires an email/password account, ignores user-editable metadata, and denies anonymous accounts', async () => {
    await db.query("update auth.users set encrypted_password='' where id=$1", [USER])
    await expect(start()).rejects.toThrow('email_password_required')
  })

  it('protects the saved cloud wardrobe with RLS before and after the trial', async () => {
    await db.query("insert into public.user_wardrobes values ($1,'{\"garments\":[\"saved\"]}')", [USER])
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [USER])
    await db.exec('set role authenticated')
    expect((await db.query('select * from public.user_wardrobes')).rows).toHaveLength(0)
    await db.exec('reset role')
    const trial = await start()
    await db.exec('set role authenticated')
    expect((await db.query('select * from public.user_wardrobes')).rows).toHaveLength(1)
    await db.exec('reset role')
    await time(trial.current_period_end)
    await db.exec('set role authenticated')
    expect((await db.query('select * from public.user_wardrobes')).rows).toHaveLength(0)
    await db.exec('reset role')
    expect((await db.query('select wardrobe from public.user_wardrobes')).rows[0].wardrobe).toEqual({ garments: ['saved'] })
  })

  it('blocks a trial while a checkout remains payable', async () => {
    await db.query("insert into billing.checkout_intents values ($1,'pending',now()+interval '30 minutes')", [USER])
    await expect(start()).rejects.toThrow('checkout_in_progress')
  })

  it('grants trial activation only to service_role and prevents direct writes to trial history', async () => {
    const { rows } = await db.query(`select has_function_privilege('anon','billing.start_account_trial(uuid)','execute') as anon,
      has_function_privilege('authenticated','billing.start_account_trial(uuid)','execute') as authenticated,
      has_function_privilege('service_role','billing.start_account_trial(uuid)','execute') as service,
      has_table_privilege('service_role','billing.account_trials','insert') as direct_write`)
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true, direct_write: false })
    expect((await db.query("select billing.plan_enabled_for_sale('plan.prelim.sek.month.12') as paid, billing.plan_enabled_for_sale('plan.prelim.sek.month.04') as old, billing.plan_enabled_for_sale('plan.trial.30days') as trial")).rows[0]).toEqual({ paid: true, old: false, trial: false })
  })
})
