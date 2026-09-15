import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const service = readFileSync('src/services/cloudSyncService.js', 'utf8')
const migration = readFileSync('supabase/user_backups_security_hardening.sql', 'utf8')

describe('user_backups defense in depth', () => {
  it('adds the authenticated owner filter to backup reads and mutations', () => {
    expect(service.match(/\.eq\('user_id', auth\.user\.id\)/g)).toHaveLength(5)
    expect(service).toContain("getLatestCloudBackup(auth.user.id)")
    expect(service).toContain(".eq('user_id', userId)")
  })

  it('keeps only the minimum authenticated table privileges', () => {
    expect(migration).toContain('revoke all privileges on table public.user_backups from anon;')
    expect(migration).toContain('revoke all privileges on table public.user_backups from authenticated;')
    expect(migration).toContain('grant select, insert, update, delete on table public.user_backups to authenticated;')
    expect(migration).toContain('revoke execute on function public.viktkollen_set_user_id() from public, anon, authenticated;')
    expect(migration).not.toMatch(/grant[^;]*\b(truncate|trigger|references)\b/i)
  })

  it('limits every backup policy to authenticated owners', () => {
    expect(migration.match(/create policy "Viktkollen users [^"]+"/g)).toHaveLength(4)
    expect(migration.match(/on public\.user_backups[^;]+to authenticated/g)).toHaveLength(4)
    expect(migration.match(/\(select auth\.uid\(\)\) = user_id/g)).toHaveLength(5)
  })
})
