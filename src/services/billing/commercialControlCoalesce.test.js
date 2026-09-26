import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const migrations = join(root, 'supabase/migrations')
const historical = readFileSync(join(migrations, '20260923130000_billing_plan_commercial_controls.sql'), 'utf8')
const repair = readFileSync(join(migrations, '20260926160000_billing_plan_commercial_coalesce_repair.sql'), 'utf8')

describe('BILL-8B commercial coalesce repair', () => {
  it('removes schema-qualified coalesce from billing migrations', () => {
    const hits = []
    for (const name of readdirSync(migrations)) {
      if (!name.endsWith('.sql')) continue
      const text = readFileSync(join(migrations, name), 'utf8')
      if (/pg_catalog\.coalesce/i.test(text)) hits.push(name)
    }
    expect(hits).toEqual([])
  })

  it('repairs only the functions that contained the invalid expression', () => {
    expect(repair).toMatch(/DO NOT apply to staging/)
    expect(repair).toMatch(/DO NOT apply to production/)
    expect(repair).toMatch(/create or replace function billing\.list_plan_commercial_controls\(p_actor_user_id uuid\)/)
    expect(repair).toMatch(/create or replace function billing\.move_plan_commercial_order\(/)
    expect(repair).not.toMatch(/create or replace function billing\.set_plan_commercial_availability/)
    expect(repair).toMatch(/security definer/)
    expect(repair).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(repair).toMatch(/billing\.has_billing_admin/)
    expect(repair).toMatch(/plan\.commercial\.changed/)
    expect(repair).toMatch(/coalesce\(stored\.enabled_for_sale, false\)/)
    expect(repair).not.toMatch(/pg_catalog\.coalesce/i)
    expect(repair).not.toMatch(/grant execute|grant select|revoke all/i)
    expect(repair).not.toMatch(/user_entitlements|stripe|checkout|webhook|proration/i)
    expect(historical).not.toMatch(/pg_catalog\.coalesce/i)
    expect(historical).toMatch(/coalesce\(stored\.enabled_for_sale, false\)/)
    expect(historical).toMatch(/force row level security/)
    expect(historical).toMatch(/revoke all on table billing\.plan_commercial_controls from public, anon, authenticated, service_role/)
    expect(historical).toMatch(/not billing\.has_billing_admin/)
  })
})
