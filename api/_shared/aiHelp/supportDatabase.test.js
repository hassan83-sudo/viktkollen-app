import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db
const paid = '10000000-0000-4000-8000-000000000001'
const free = '10000000-0000-4000-8000-000000000002'
const admin = '10000000-0000-4000-8000-000000000003'
async function call(kind, actor, action, body = {}) {
  const result = await db.query(`select support.${kind}_command($1,$2,$3::jsonb) as result`, [actor, action, JSON.stringify(body)])
  return result.rows[0].result
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create schema billing;
    create table billing.plans(plan_id text primary key, price_minor integer);
    create table billing.subscriptions(user_id uuid, plan_id text, status text, current_period_start timestamptz, current_period_end timestamptz, past_due_grace_until timestamptz);
    create function billing.has_billing_admin(p_user uuid) returns boolean language sql as $$ select p_user = '${admin}'::uuid $$;
    grant usage on schema billing to service_role;
    grant select on all tables in schema billing to service_role;
    insert into auth.users values('${paid}'),('${free}'),('${admin}');
    insert into billing.plans values('plan.free',0),('premium',400);
    insert into billing.subscriptions values('${paid}','premium','ACTIVE', now()-interval '1 day',now()+interval '1 month',null);
  `)
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261017091445_paid_customer_support.sql', import.meta.url), 'utf8'))
}, 30000)
afterAll(async () => { await db?.close() })

describe('paid support PostgreSQL boundary', () => {
  it('denies free customers regardless of forged entitlement and admin claims', async () => {
    expect(await call('customer', free, 'create', { requestId: randomUUID(), category: 'billing', message: 'Help', premium: true, user_id: paid })).toMatchObject({ ok: false, code: 'PAID_SUPPORT_REQUIRED' })
    expect(await call('admin', free, 'list')).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })
  it('requires a currently paid period and excludes trials, paused and expired subscriptions', async () => {
    for (const status of ['TRIALING','PAUSED','EXPIRED']) {
      await db.query('update billing.subscriptions set status=$1 where user_id=$2', [status, paid])
      expect((await call('customer', paid, 'list')).eligible).toBe(false)
    }
    await db.query("update billing.subscriptions set status='ACTIVE',current_period_end=now()-interval '1 second' where user_id=$1", [paid])
    expect((await call('customer', paid, 'list')).eligible).toBe(false)
    await db.query("update billing.subscriptions set current_period_end=now()+interval '1 month' where user_id=$1", [paid])
  })
  it('creates a high-priority payment ticket and notification atomically; retries are idempotent', async () => {
    const body = { requestId: randomUUID(), category: 'billing', message: 'Payment help' }
    const created = await call('customer', paid, 'create', body)
    expect(created.ticket).toMatchObject({ priority: 'high', notification_pending: true, status: 'open' })
    const retried = await call('customer', paid, 'create', body)
    expect(retried.ticket.id).toBe(created.ticket.id)
    expect((await call('customer', free, 'list')).tickets).toEqual([])
    const list = await call('admin', admin, 'list')
    expect(list.pendingCount).toBe(1)
    expect(list.tickets[0].thread[0].message).toBe('Payment help')
    expect(await call('customer', free, 'reply', { ticketId: created.ticket.id, version: 1, message: 'intrusion' })).toMatchObject({ ok: false })
    const reply = await call('admin', admin, 'reply', { ticketId: created.ticket.id, version: 1, message: 'We can help here' })
    expect(reply.ticket).toMatchObject({ status: 'answered', notification_pending: false, version: 2 })
    expect((await call('customer', paid, 'list')).tickets[0].thread[1].role).toBe('support')
    expect(await call('admin', admin, 'update', { ticketId: created.ticket.id, version: 1, status: 'resolved', priority: 'low' })).toMatchObject({ code: 'CONFLICT' })
    await db.query("update support.tickets set updated_at=now()-interval '6 seconds' where id=$1", [created.ticket.id])
    const followup = await call('customer', paid, 'reply', { ticketId: created.ticket.id, version: 2, message: 'One more question' })
    expect(followup.ticket).toMatchObject({ status: 'open', notification_pending: true, version: 3 })
  })
  it('enforces the per-customer open-ticket limit', async () => {
    for (let i = 0; i < 2; i++) expect((await call('customer', paid, 'create', { requestId: randomUUID(), category: 'technical', message: 'Help' })).ok).toBe(true)
    expect(await call('customer', paid, 'create', { requestId: randomUUID(), category: 'technical', message: 'Help' })).toMatchObject({ code: 'RATE_LIMITED' })
  })
  it('denies another paying customer and preserves the owner thread', async () => {
    const other = '10000000-0000-4000-8000-000000000004'
    await db.query('insert into auth.users values($1)', [other])
    await db.query("insert into billing.subscriptions values($1,'premium','ACTIVE',now()-interval '1 day',now()+interval '1 month',null)", [other])
    const ticket = (await call('customer', paid, 'list')).tickets[0]
    expect(await call('customer', other, 'reply', { ticketId: ticket.id, version: ticket.version, message: 'intrusion' })).toMatchObject({ code: 'NOT_FOUND' })
    expect((await call('customer', other, 'list')).tickets).toEqual([])
  })
  it('denies direct table and RPC access to browser database roles', async () => {
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await expect(db.query('select * from support.tickets')).rejects.toMatchObject({ code: '42501' })
      await expect(call('customer', paid, 'list')).rejects.toMatchObject({ code: '42501' })
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    expect((await call('customer', paid, 'list')).ok).toBe(true)
    await db.exec('reset role')
  })
})
