import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260926133000_billing_sync_plan_assignment.sql'), 'utf8')
const body = sql.replace(/--[^\n]*/g, '')

describe('BILL-7P plan assignment RPC', () => {
  it('derives the assignment inside a service-role function and does not apply early', () => {
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).toMatch(/create or replace function billing\.sync_plan_assignment_from_subscription/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).toMatch(/revoke all on function billing\.sync_plan_assignment_from_subscription\(text, text\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant execute on function billing\.sync_plan_assignment_from_subscription\(text, text\) to service_role/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(body).toMatch(/s\.status in \('TRIALING', 'ACTIVE'\)/)
    expect(body).toMatch(/s\.status = 'PAST_DUE'/)
    expect(body).toMatch(/s\.past_due_grace_until is not null/)
    expect(body).toMatch(/target_plan := chosen\.plan_id/)
    expect(body).toMatch(/target_plan := 'plan\.free'/)
    expect(body).toMatch(/target_source := 'server'/)
    expect(body).toMatch(/target_source := 'server-default'/)
    expect(body).not.toMatch(/pending_plan_id|cancel_at_period_end/)
    expect(body).toMatch(/raise exception 'duplicate_external_event'/)
    expect(body).toMatch(/when unique_violation then/)
    const lockAt = body.indexOf('for update')
    const recheckAt = body.indexOf('from billing.user_plan_assignment_events e', lockAt)
    const writeAt = body.indexOf('insert into billing.user_plan_assignments')
    expect(lockAt).toBeGreaterThan(-1)
    expect(recheckAt).toBeGreaterThan(lockAt)
    expect(writeAt).toBeGreaterThan(recheckAt)
    expect(body.indexOf("raise exception 'duplicate_external_event'", lockAt)).toBeLessThan(writeAt)
    expect(body.slice(lockAt, writeAt)).toMatch(/return assigned/)
    expect(body).not.toMatch(/quota_reservations|reserve_quota|user_entitlements/i)
    expect(body).not.toMatch(/stripe|sumup|klarna|checkout|webhook/i)
  })
})
