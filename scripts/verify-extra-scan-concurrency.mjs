import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
const url = process.env.EXTRA_SCAN_TEST_DATABASE_URL
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.startsWith('/extra_scan_test')) throw new Error('Isolated local extra_scan_test database required')
const clients = Array.from({length:3},()=>new pg.Client({connectionString:url}))
try {
  await Promise.all(clients.map(c=>c.connect()))
  const [setup,a,b]=clients
  await setup.query('create role anon; create role authenticated; create role service_role bypassrls;')
  for(const name of ['20260921180000_billing_plan_quota.sql','20261011180000_extra_scan_ledger_preparation.sql',readdirSync('supabase/migrations').find(p=>p.endsWith('_extra_scan_sandbox_checkout.sql'))]) await setup.query(readFileSync('supabase/migrations/'+name,'utf8'))
  const user=randomUUID()
  const rpc=async(c,action,data)=>(await c.query('select billing.extra_scan_purchase($1,$2,$3) value',[action,user,JSON.stringify(data)])).rows[0].value
  const intent=await rpc(setup,'create',{request_key:randomUUID(),feature:'food.scan',quantity:1,amount_minor:100,merchant_code:'TEST123'})
  const checkout=randomUUID()
  await rpc(setup,'bind',{id:intent.id,provider_checkout_id:checkout,hosted_url:'https://checkout.sumup.com/pay/test'})
  const grants=await Promise.all([rpc(a,'grant',{id:intent.id,provider_checkout_id:checkout}),rpc(b,'grant',{id:intent.id,provider_checkout_id:checkout})])
  assert.equal(grants[0].id,grants[1].id)
  await setup.query("update billing.plan_entitlements set limit_value=0 where feature='food.scan'")
  const reserve=async(c,id)=>(await c.query("select billing.reserve_quota($1,'food.scan','requests',1,$2) value",[user,id])).rows[0].value
  await a.query('begin')
  assert.equal((await reserve(a,'race-a')).status,'RESERVED')
  const waiting=reserve(b,'race-b')
  await a.query('commit')
  assert.equal((await waiting).status,'DENIED_QUOTA_EXCEEDED')
  const outcomes=await Promise.all([a.query("select billing.commit_quota('race-a',1) value"),b.query("select billing.rollback_quota('race-a') value")])
  assert.ok(outcomes.every(r=>r.rows[0].value.status==='COMMITTED'||r.rows[0].value.status==='ROLLED_BACK'))
  const terminal=(await setup.query("select status from billing.quota_reservations where reservation_id='race-a'")).rows[0].status
  const allocated=(await setup.query("select status from billing.extra_scan_allocations where reservation_id='race-a'")).rows[0].status
  assert.equal(allocated,terminal)
  console.log('PASS: concurrent duplicate grant, last-unit reservation, commit/rollback race (3 connections)')
} finally { await Promise.allSettled(clients.map(c=>c.end())) }
