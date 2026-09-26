import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(root, 'migrations/20260924150000_purge_place_participation.sql'), 'utf8')
const executable = sql.replace(/--[^\n]*/g, '')

function deleteStatement(table) {
  const match = executable.match(new RegExp(`delete from public\\.${table}\\s+[\\s\\S]*?;`, 'i'))
  return match ? match[0] : ''
}

describe('place participation purge', () => {
  it('deletes a location share only by user_id', () => {
    const statement = deleteStatement('place_location_shares')
    expect(statement).toContain('where user_id = p_user_id')
    expect(statement).not.toMatch(/recipient_user_id/)
  })

  it('deletes live locations only for the owner or the recipient', () => {
    const statement = deleteStatement('place_e2ee_live_locations')
    expect(statement).toContain('where owner_user_id = p_user_id')
    expect(statement).toContain('or recipient_user_id = p_user_id')
    expect(statement).not.toMatch(/\buser_id\s*=/)
  })

  it('deletes voice signals only by sender_user_id', () => {
    const statement = deleteStatement('place_voice_call_signals')
    expect(statement).toContain('where sender_user_id = p_user_id')
    expect(statement).not.toMatch(/call_id/)
  })

  it('does not delete envelopes, keys, or preserved shared rows', () => {
    expect(executable).not.toMatch(/place_e2ee_envelopes/i)
    expect(executable).not.toMatch(/place_e2ee_device_keys|place_e2ee_public_keys/i)
    expect(executable).not.toMatch(/place_families|place_family_members|place_family_invites|place_checkins|place_safe_places|place_safe_place_presence|place_safety_alerts|place_location_requests|place_trip_shares|place_trip_events|place_shared_route_points|place_voice_calls|social_board_posts|social_room_videos|user_entitlements|social_purge_user_data/i)
  })

  it('is service-role only with a fixed search path', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = pg_catalog, public')
    expect(sql).toContain('if p_user_id is null then')
    expect(sql).toContain("if auth.role() is distinct from 'service_role' then")
    expect(sql).toContain('revoke all on function public.purge_place_participation(uuid) from public;')
    expect(sql).toContain('revoke all on function public.purge_place_participation(uuid) from anon;')
    expect(sql).toContain('revoke all on function public.purge_place_participation(uuid) from authenticated;')
    expect(sql).toContain('grant execute on function public.purge_place_participation(uuid) to service_role;')
    expect(executable).not.toMatch(/grant execute on function public\.purge_place_participation\(uuid\) to (public|anon|authenticated)/i)
  })
})
