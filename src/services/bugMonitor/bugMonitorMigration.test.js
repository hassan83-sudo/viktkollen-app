import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkMigration } from '../../../scripts/publicTableMigrationGuard.mjs'

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/20261015130000_bug_monitor_reports.sql'), 'utf8')

describe('bug monitor migration', () => {
  it('stays out of the public schema and denies client access', () => {
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).not.toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\./i)
    expect(checkMigration('20261015130000_bug_monitor_reports.sql', sql)).toEqual([])
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/force row level security/i)
    expect(sql).toMatch(/revoke all on table bug_monitor\.reports from public, anon, authenticated, service_role/i)
    expect(sql).toMatch(/revoke all on function bug_monitor\.summary\(\) from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function bug_monitor\.summary\(\) to service_role/i)
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+table\s+bug_monitor\.reports\s+to\s+(anon|authenticated|public)/i)
  })

  it('keeps spam limits and distinct affected users in the database', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/)
    expect(sql).toMatch(/interval '1 hour'/)
    expect(sql).toMatch(/interval '60 seconds'/)
    expect(sql).toMatch(/recent_count >= 30/)
    expect(sql).toMatch(/count\(distinct actor_key\)/)
    expect(sql).toMatch(/count\(distinct r\.actor_key\)/)
  })

  it('has no column for images, chat, tokens or email', () => {
    const table = sql.slice(sql.indexOf('create table if not exists bug_monitor.reports'), sql.indexOf('create index'))
    expect(table).not.toMatch(/\b(authorization|chat|email|image|message|password|token)\b/i)
    expect(sql).toMatch(/actor_key is a hash or the literal "server"/)
  })
})
