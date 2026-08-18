import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/release_acceptance_checks.sql', 'utf8')
const executableSql = sql
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

describe('release acceptance Supabase checks', () => {
  it('documents required tables and RLS policy checks', () => {
    expect(sql).toContain('user_backups')
    expect(sql).toContain('user_sync_state')
    expect(sql).toContain('user_sync_events')
    expect(sql).toContain('user_sync_items')
    expect(sql).toContain('storage_key')
    expect(sql).toContain('pg_policies')
    expect(sql).toContain('relrowsecurity')
    expect(sql).toContain('auth.uid()')
  })

  it('is read-only by default', () => {
    expect(executableSql).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate)\b/i)
    expect(executableSql).not.toMatch(/service[_-]?role/i)
  })
})
