import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(root, 'migrations/20260924170000_purge_account_user_data.sql'), 'utf8')
const executable = sql.replace(/--[^\n]*/g, '')

describe('atomic account purge orchestrator', () => {
  it('declares the exact service-role function', () => {
    expect(sql).toContain('create or replace function public.purge_account_user_data(p_user_id uuid)')
    expect(sql).toContain('returns void')
    expect(sql).toContain('language plpgsql')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = pg_catalog, public')
    expect(sql).toContain('if p_user_id is null then')
    expect(sql).toContain("if auth.role() is distinct from 'service_role' then")
    expect(sql).toContain("raise exception 'not allowed'")
  })

  it('runs family, social, sync, backups, exclusive, and participation in that order', () => {
    const steps = [
      'perform public.purge_family_membership(p_user_id);',
      'perform public.social_purge_user_data(p_user_id);',
      'delete from public.user_sync_items',
      'delete from public.user_sync_events',
      'delete from public.user_sync_state',
      'delete from public.user_backups',
      'perform public.purge_exclusive_user_data(p_user_id);',
      'perform public.purge_place_participation(p_user_id);',
    ]
    let previous = -1
    for (const step of steps) {
      const index = executable.indexOf(step)
      expect(index).toBeGreaterThan(previous)
      previous = index
    }
    expect(executable).toContain('where user_id = p_user_id')
  })

  it('lets errors propagate without its own transaction control', () => {
    expect(executable).not.toMatch(/\bexception\s+when\b/i)
    expect(executable).not.toMatch(/\bcommit\b/i)
    expect(executable).not.toMatch(/\brollback\b/i)
  })

  it('grants execute only to service_role', () => {
    expect(sql).toContain('revoke all on function public.purge_account_user_data(uuid) from public;')
    expect(sql).toContain('revoke all on function public.purge_account_user_data(uuid) from anon;')
    expect(sql).toContain('revoke all on function public.purge_account_user_data(uuid) from authenticated;')
    expect(sql).toContain('grant execute on function public.purge_account_user_data(uuid) to service_role;')
    expect(executable).not.toMatch(/grant execute on function public\.purge_account_user_data\(uuid\) to (public|anon|authenticated)/i)
  })
})
