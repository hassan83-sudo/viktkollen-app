import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20261106140000_billing_read_sumup_instrument_fingerprint.sql'), 'utf8')
const body = sql.slice(sql.indexOf('as $$'), sql.indexOf('revoke all on function'))

describe('read_sumup_instrument_fingerprint permissions', () => {
  it('exposes one security-definer read of the stored fingerprint', () => {
    expect(sql).toMatch(/create or replace function billing\.read_sumup_instrument_fingerprint\(\s*p_subscription_id text\s*\)\s*returns text/)
    expect(sql).toMatch(/language plpgsql\s+stable\s+security definer\s+set search_path = pg_catalog, pg_temp/)
    expect(body).toMatch(/select i\.instrument_fingerprint\s+into stored_fingerprint\s+from billing\.sumup_recurring_instruments i/)
    expect(body).toMatch(/where i\.subscription_id = p_subscription_id\s+and i\.status = 'verified'/)
    expect(body).not.toMatch(/select \*|user_id|provider_customer_ref|setup_checkout_ref|card|token|cvv|pan/i)
    expect(sql).not.toMatch(/create table|alter table|grant\s+(select|all)\s+on\s+table\s+billing\.sumup_recurring_instruments/i)
  })

  it('lets only service_role execute the function', () => {
    expect(sql).toMatch(/revoke all on function billing\.read_sumup_instrument_fingerprint\(text\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.read_sumup_instrument_fingerprint\(text\) to service_role/)
    expect(sql).not.toMatch(/grant execute on function billing\.read_sumup_instrument_fingerprint\(text\) to (public|anon|authenticated)/)
    expect(sql).not.toMatch(/grant select/i)
  })
})
