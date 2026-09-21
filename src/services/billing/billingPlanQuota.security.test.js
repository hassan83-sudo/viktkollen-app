import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { USAGE_UNITS } from './catalog.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260921180000_billing_plan_quota.sql'), 'utf8')

describe('BILL-2 plan/quota migration static security', () => {
  it('does not instruct production apply and has no payment providers', () => {
    const ddl = sql.replace(/--[^\n]*/g, '').replace(/comment on[\s\S]*?;/gi, '')
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(ddl).not.toMatch(/stripe|sumup|klarna|iap|play billing|checkout|refund|proration/i)
    expect(ddl).not.toMatch(/alter table billing\.usage_events/i)
  })

  it('force-RLS denies anon/authenticated and avoids Infinity unlimited encoding', () => {
    const ddl = sql.replace(/--[^\n]*/g, '').replace(/comment on[\s\S]*?;/gi, '')
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/using \(false\)/)
    expect(sql).toMatch(/limit_kind in \('NUMBER', 'UNLIMITED'\)/)
    expect(ddl).not.toMatch(/999999999/)
    expect(ddl).not.toMatch(/\bInfinity\b/)
    USAGE_UNITS.forEach((unit) => expect(sql).toContain(`'${unit}'`))
  })

  it('stores reservation identity without sensitive content columns', () => {
    const ddl = sql.replace(/--[^\n]*/g, '').replace(/comment on[\s\S]*?;/gi, '')
    expect(ddl).not.toMatch(/\bprompt\b/)
    expect(ddl).not.toMatch(/\baudio\b/)
    expect(ddl).not.toMatch(/\bpassword\b/)
    expect(ddl).not.toMatch(/\blatitude\b/)
    expect(sql).toMatch(/grant select, insert, update on table billing\.quota_reservations to service_role/)
    expect(sql).toMatch(/revoke delete on table billing\.quota_reservations/)
  })
})
