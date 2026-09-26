import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260926150000_billing_plan_enabled_for_sale.sql'), 'utf8')
const body = sql.replace(/--[^\n]*/g, '')

describe('BILL-7X3 plan sale read', () => {
  it('exposes only a service-role boolean and fail-closes a missing row', () => {
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/create or replace function billing\.plan_enabled_for_sale\(p_plan_id text\)/)
    expect(sql).toMatch(/returns boolean/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(body).toMatch(/select stored\.enabled_for_sale/)
    expect(body).toMatch(/pg_catalog\.coalesce\(\([\s\S]*\), false\)/)
    expect(body).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i)
    expect(body).not.toMatch(/grant select on table billing\.plan_commercial_controls/i)
    expect(sql).toMatch(/revoke all on function billing\.plan_enabled_for_sale\(text\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.plan_enabled_for_sale\(text\) to service_role/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(body).not.toMatch(/price|entitlement|quota|user_entitlements|stripe|checkout|webhook/i)
  })
})
