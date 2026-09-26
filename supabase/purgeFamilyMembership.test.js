import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(root, 'migrations/20260924160000_purge_family_membership.sql'), 'utf8')
const executable = sql.replace(/--[^\n]*/g, '')

describe('family membership purge', () => {
  it('deletes only the departing user membership for the locked family', () => {
    const statement = executable.match(/delete from public\.place_family_members[\s\S]*?;/i)?.[0] || ''
    expect(statement).toContain('where family_id = v_family_id')
    expect(statement).toContain('and user_id = p_user_id')
    expect(executable.match(/delete from/gi)).toHaveLength(1)
  })

  it('transfers created_by to the earliest remaining guardian before that delete', () => {
    const successor = executable.indexOf("and m.role = 'guardian'")
    const ordering = executable.indexOf('order by m.joined_at asc, m.user_id asc')
    const transfer = executable.indexOf('set created_by = v_successor')
    const verify = executable.indexOf('v_verified_created_by is distinct from v_successor')
    const membershipDelete = executable.indexOf('delete from public.place_family_members')

    expect(successor).toBeGreaterThan(-1)
    expect(ordering).toBeGreaterThan(successor)
    expect(transfer).toBeGreaterThan(ordering)
    expect(verify).toBeGreaterThan(transfer)
    expect(membershipDelete).toBeGreaterThan(verify)
    expect(executable).toContain('and m.user_id <> p_user_id')
    expect(executable).not.toMatch(/set\s+role\b/i)
  })

  it('raises and does not delete the family when no guardian remains', () => {
    const blocked = executable.indexOf("raise exception 'no remaining guardian'")
    const membershipDelete = executable.indexOf('delete from public.place_family_members')
    expect(blocked).toBeGreaterThan(-1)
    expect(blocked).toBeLessThan(membershipDelete)
    expect(executable).not.toMatch(/delete\s+from\s+public\.place_families\b/i)
    expect(executable).not.toMatch(/\bexception\s+when\b/i)
    expect(executable).not.toMatch(/\bcommit\b/i)
  })

  it('processes every membership in family_id order under row locks', () => {
    const familyLock = executable.indexOf('from public.place_families f')
    const memberLock = executable.indexOf('order by m.user_id asc')
    expect(executable).toContain('where m.user_id = p_user_id')
    expect(executable).toContain('order by m.family_id asc')
    expect(executable.slice(familyLock).indexOf('for update')).toBeGreaterThan(-1)
    expect(memberLock).toBeGreaterThan(familyLock)
    expect(executable.slice(memberLock).indexOf('for update')).toBeGreaterThan(-1)
  })

  it('does not touch invites, shared history, or E2EE material', () => {
    expect(executable).not.toMatch(/place_family_invites|place_e2ee_envelopes|place_e2ee_device_keys|place_e2ee_public_keys|place_checkins|place_safe_places|place_safe_place_presence|place_safety_alerts|place_location_requests|place_trip_shares|place_trip_events|place_shared_route_points|place_voice_calls|social_board_posts|social_room_videos|user_entitlements|social_purge_user_data/i)
  })

  it('is service-role only with a fixed search path', () => {
    expect(sql).toContain('returns void')
    expect(sql).toContain('language plpgsql')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = pg_catalog, public')
    expect(sql).toContain('if p_user_id is null then')
    expect(sql).toContain("if auth.role() is distinct from 'service_role' then")
    expect(sql).toContain('revoke all on function public.purge_family_membership(uuid) from public;')
    expect(sql).toContain('revoke all on function public.purge_family_membership(uuid) from anon;')
    expect(sql).toContain('revoke all on function public.purge_family_membership(uuid) from authenticated;')
    expect(sql).toContain('grant execute on function public.purge_family_membership(uuid) to service_role;')
    expect(executable).not.toMatch(/grant execute on function public\.purge_family_membership\(uuid\) to (public|anon|authenticated)/i)
  })
})
