import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'migrations/20260924130000_social_purge_user_data.sql'),
  'utf8',
)
const executable = sql.replace(/--[^\n]*/g, '')

describe('social purge policy C', () => {
  it('defines a service-role security definer with a fixed search path', () => {
    expect(sql).toContain('create or replace function public.social_purge_user_data(p_user_id uuid)')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = pg_catalog, public')
    expect(sql).toContain("if auth.role() is distinct from 'service_role' then")
    expect(sql).toContain("raise exception 'not allowed'")
    expect(sql).toContain('if p_user_id is null then')
    expect(sql).toContain("raise exception 'invalid user'")
  })

  it('revokes browser roles and grants service_role only', () => {
    expect(sql).toContain('revoke all on function public.social_purge_user_data(uuid) from public;')
    expect(sql).toContain('revoke all on function public.social_purge_user_data(uuid) from anon;')
    expect(sql).toContain('revoke all on function public.social_purge_user_data(uuid) from authenticated;')
    expect(sql).toContain('grant execute on function public.social_purge_user_data(uuid) to service_role;')
    expect(executable).not.toMatch(/grant execute on function public\.social_purge_user_data\(uuid\) to (public|anon|authenticated)/i)
  })

  it('deletes only the departing user rows named by policy C', () => {
    expect(sql).toContain('delete from public.social_messages')
    expect(sql).toContain('where sender_id = p_user_id')
    expect(sql).toContain('delete from public.social_conversation_members')
    expect(sql).toContain('where user_id = p_user_id')
    expect(sql).toContain('delete from public.social_dm_pairs')
    expect(sql).toContain('where user_low = p_user_id')
    expect(sql).toContain('or user_high = p_user_id')
    expect(sql).toContain('delete from public.social_location_envelopes')
    expect(sql).toContain('where owner_user_id = p_user_id')
    expect(sql).toContain('or recipient_user_id = p_user_id')
    expect(sql).toContain('delete from public.social_locations')
    expect(sql).toContain('delete from public.social_friend_requests')
    expect(sql).toContain('where from_user_id = p_user_id')
    expect(sql).toContain('or to_user_id = p_user_id')
    expect(sql).toContain('delete from public.social_friendships')
    expect(sql).toContain('delete from public.social_blocks')
    expect(sql).toContain('where blocker_id = p_user_id')
    expect(sql).toContain('or blocked_id = p_user_id')
    expect(sql).toContain('delete from public.social_public_profiles')
  })

  it('does not delete the shared thread, keys, or vault secrets', () => {
    expect(executable).not.toMatch(/delete\s+from\s+public\.social_conversations\b/i)
    expect(executable).not.toMatch(/delete\s+from\s+private\.social_conversation_keys\b/i)
    expect(executable).not.toMatch(/delete\s+from\s+vault\.secrets\b/i)
    expect(executable).not.toMatch(/vault\.delete_secret/i)
    expect(executable).not.toMatch(/social_messages[\s\S]*conversation_id/i)
    expect(sql).not.toContain('conversation_id = any')
    expect(executable).not.toMatch(/\bexecute\s+['$]/i)
  })
})
