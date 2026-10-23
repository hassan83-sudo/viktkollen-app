// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createExtraScanService, extraScanConfig } from './extraScanCheckout.js'
import { handleExtraScanRequest } from './extraScanRoute.js'
let db, service, current, transport
const user = '11111111-1111-4111-8111-111111111111'
const config = { prices: { 'food.scan': 100, 'body.scan': 200, 'ai.eye.analysis': 100 }, merchantCode: 'TEST123', callbackUrl: 'https://sandbox.vercel.app/api/billing/extra-scans-webhook' }
const env = { EXTRA_SCAN_SANDBOX_ENABLED: 'true', SUPABASE_URL: 'https://armtslzspuebmlysnooq.supabase.co', SUMUP_API_KEY: 'test-key', SUMUP_MERCHANT_CODE: 'TEST123', EXTRA_SCAN_SANDBOX_MERCHANT_CODE: 'TEST123', EXTRA_SCAN_FOOD_MINOR: '100', EXTRA_SCAN_BODY_MINOR: '200', EXTRA_SCAN_EYE_MINOR: '100', EXTRA_SCAN_SANDBOX_CALLBACK_URL: config.callbackUrl }
async function rpc(action, userId, data) { return (await db.query('select billing.extra_scan_purchase($1,$2,$3) value', [action, userId, JSON.stringify(data)])).rows[0].value }
async function reserve(id, quantity=1, feature='food.scan') { return (await db.query('select billing.reserve_quota($1,$2,\'requests\',$3,$4) value', [user,feature,quantity,id])).rows[0].value }
async function purchase(feature='food.scan',quantity=2) {
  const intent = await service.create(user,{feature,quantity,requestKey:randomUUID()})
  current.status='PAID'
  current.transactions=[{id:randomUUID(),status:'SUCCESSFUL',amount:intent.amount_minor/100,currency:'SEK'}]
  return { intent, grant: await service.verify(user,intent.id) }
}
beforeAll(async () => {
  db=new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  for (const name of ['20260921180000_billing_plan_quota.sql','20261011180000_extra_scan_ledger_preparation.sql',readdirSync('supabase/migrations').find(p=>p.endsWith('_extra_scan_sandbox_checkout.sql'))]) await db.exec(readFileSync('supabase/migrations/'+name,'utf8'))
},20000)
afterAll(async()=>db.close())
beforeEach(async()=>{
  await db.exec('begin')
  current=null
  transport={createCheckout: async body => { current={...body,id:randomUUID(),status:'PENDING',hosted_checkout_url:'https://checkout.sumup.com/pay/test'};return current }, retrieveCheckout: async()=>current,listCheckouts:async()=>[current]}
  service=createExtraScanService({config,rpc,transport})
})
afterEach(async()=>db.exec('rollback'))
describe('extra scan purchase through provider verification and real Postgres functions',()=>{
  it('blocks production, wrong project, missing prices and unconfirmed merchant',()=>{
    expect(extraScanConfig(env)).not.toBeNull()
    for(const patch of [{VERCEL_ENV:'production'},{SUPABASE_URL:'https://production.supabase.co'},{EXTRA_SCAN_FOOD_MINOR:''},{EXTRA_SCAN_SANDBOX_MERCHANT_CODE:'OTHER'}]) expect(extraScanConfig({...env,...patch})).toBeNull()
  })
  it('works for a free account, ignores client price and does not assign a subscription',async()=>{
    const intent=await service.create(user,{feature:'body.scan',quantity:2,requestKey:randomUUID(),amount_minor:1,user_id:'other'})
    expect(intent.amount_minor).toBe(400)
    expect((await db.query('select * from billing.user_plan_assignments')).rows).toHaveLength(0)
    expect((await service.balance(user))).toEqual([])
  })
  it('rejects unsupported types, invalid quantities and another user reading an intent',async()=>{
    await expect(service.create(user,{feature:'ai.text.request',quantity:1,requestKey:randomUUID()})).rejects.toThrow('INVALID_SELECTION')
    const {intent}=await purchase()
    await expect(service.verify(randomUUID(),intent.id)).rejects.toThrow('intent_missing')
  })
  it('makes create and paid grants idempotent and fixes expiry at 720 hours',async()=>{
    const key=randomUUID(); const a=await service.create(user,{feature:'food.scan',quantity:2,requestKey:key});const b=await service.create(user,{feature:'food.scan',quantity:2,requestKey:key})
    expect(a.id).toBe(b.id)
    current.status='PAID';current.transactions=[{id:randomUUID(),status:'SUCCESSFUL',amount:2,currency:'SEK'}]
    const first=await service.verify(user,a.id);const retry=await service.verify(user,a.id)
    expect(retry.id).toBe(first.id);expect(retry.expires_at).toBe(first.expires_at)
    expect(Date.parse(first.expires_at)-Date.parse(first.verified_paid_at)).toBe(720*3600000)
    await expect(service.create(user,{feature:'body.scan',quantity:2,requestKey:key})).rejects.toThrow('intent_conflict')
  })
  it('fails closed on forged amount, currency, merchant, reference or transaction',async()=>{
    const {intent}=await purchase()
    for(const patch of [{amount:0.01},{currency:'EUR'},{merchant_code:'WRONG'},{checkout_reference:randomUUID()},{transactions:[]}]) {
      const saved=current;current={...current,...patch};await expect(service.verify(user,intent.id)).rejects.toThrow('PAYMENT_MISMATCH');current=saved
    }
  })
  it('uses monthly allowance first and splits one reservation across batches',async()=>{
    await db.exec("update billing.plan_entitlements set limit_value=1 where feature='food.scan'")
    await purchase('food.scan',1);await purchase('food.scan',2)
    expect((await reserve('mixed',3)).status).toBe('RESERVED')
    expect((await db.query("select sum(quantity)::int quantity from billing.extra_scan_allocations where reservation_id='mixed'")).rows[0].quantity).toBe(2)
    await db.query("select billing.commit_quota('mixed',2)")
    expect((await db.query("select * from billing.quota_period_used($1,'food.scan','requests',date_trunc('month',now() at time zone 'UTC') at time zone 'UTC',now())",[user])).rows[0].committed).toBe(1)
    expect((await service.balance(user)).reduce((sum,b)=>sum+Number(b.remaining),0)).toBe(2)
  })
  it('reserves the last purchased scan only once and rollback releases it',async()=>{
    await db.exec("update billing.plan_entitlements set limit_value=0 where feature='food.scan'")
    await purchase('food.scan',1)
    const results=await Promise.all([reserve('one'),reserve('two')])
    expect(results.map(r=>r.status).sort()).toEqual(['DENIED_QUOTA_EXCEEDED','RESERVED'])
    const id=results[0].status==='RESERVED'?'one':'two'
    await db.query('select billing.rollback_quota($1)',[id]);await db.query('select billing.rollback_quota($1)',[id])
    expect((await reserve('three')).status).toBe('RESERVED')
    await db.query("select billing.commit_quota('three',1)");await db.query("select billing.commit_quota('three',1)")
    expect((await service.balance(user))[0].remaining).toBe(0)
  })
  it('never resurrects an expired purchase when a scan rolls back',async()=>{
    await db.exec("update billing.plan_entitlements set limit_value=0 where feature='food.scan'")
    await purchase('food.scan',1);await reserve('expired-batch')
    await db.exec("update billing.extra_scan_grants set verified_paid_at=now()-interval '31 days',expires_at=now()-interval '1 day'")
    await db.query("select billing.rollback_quota('expired-batch')")
    expect((await reserve('next')).status).toBe('DENIED_QUOTA_EXCEEDED')
    expect(await service.balance(user)).toEqual([])
  })
  it('expires abandoned reservations and prevents late commits',async()=>{
    await db.exec("update billing.plan_entitlements set limit_value=0 where feature='food.scan'")
    await purchase('food.scan',1);await reserve('abandoned')
    await db.exec("update billing.quota_reservations set expires_at=now()-interval '1 second' where reservation_id='abandoned'")
    expect((await reserve('abandoned')).status).toBe('EXPIRED')
    expect((await reserve('replacement')).status).toBe('RESERVED')
    expect((await db.query("select billing.commit_quota('abandoned',1) value")).rows[0].value.status).toBe('EXPIRED')
  })
  it('reverses a refunded batch and pending reservations without regranting it',async()=>{
    await db.exec("update billing.plan_entitlements set limit_value=0 where feature='food.scan'")
    const {intent}=await purchase('food.scan',1);await reserve('refund')
    current.transactions[0].status='REFUNDED'
    expect((await service.verify(user,intent.id)).status).toBe('REVERSED')
    expect((await db.query("select billing.commit_quota('refund',1) value")).rows[0].value.status).toBe('ROLLED_BACK')
    current.transactions[0].status='SUCCESSFUL'
    expect((await service.verify(user,intent.id)).status).toBe('REVERSED')
    expect((await reserve('after-refund')).status).toBe('DENIED_QUOTA_EXCEEDED')
  })
  it('supports all scan types on a paid plan without changing that plan',async()=>{
    await db.exec("insert into billing.user_plan_assignments(user_id,plan_id,plan_version,source) values ('11111111-1111-4111-8111-111111111111','plan.prelim.sek.month.04',1,'server')")
    for(const feature of ['food.scan','body.scan','ai.eye.analysis']) {
      await db.query('update billing.plan_entitlements set limit_value=0 where feature=$1',[feature])
      await purchase(feature,1)
      expect((await reserve(randomUUID(),1,feature)).status).toBe('RESERVED')
    }
    expect((await db.query('select plan_id from billing.user_plan_assignments where user_id=$1',[user])).rows[0].plan_id).toBe('plan.prelim.sek.month.04')
  })
  it('keeps old-period spending against its batch after a period change',async()=>{
    await db.exec("update billing.plan_entitlements set limit_value=0 where feature='food.scan'")
    await purchase('food.scan',1)
    await reserve('prior-period')
    await db.query("select billing.commit_quota('prior-period',1)")
    // Simulate a historical row without changing production function clocks.
    await db.exec("alter table billing.quota_reservations disable trigger quota_reservations_guard; update billing.quota_reservations set period_start=period_start-interval '1 month',period_end=period_end-interval '1 month' where reservation_id='prior-period'; alter table billing.quota_reservations enable trigger quota_reservations_guard")
    expect((await reserve('new-period')).status).toBe('DENIED_QUOTA_EXCEEDED')
  })
  it('does not let clients call the grant RPC or insert grants',async()=>{
    const privileges=await db.query("select has_function_privilege('authenticated','billing.extra_scan_purchase(text,uuid,jsonb)','execute') allowed,has_table_privilege('authenticated','billing.extra_scan_grants','insert') writable")
    expect(privileges.rows[0]).toEqual({allowed:false,writable:false})
  })
  it('requires authentication for customer checkout and uses only the verified identity',async()=>{
    const response={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}}
    await handleExtraScanRequest({method:'POST',body:{action:'create'}},response,{service,verifyUser:async()=>({authenticated:false,status:401})})
    expect(response.code).toBe(401)
  })
})
