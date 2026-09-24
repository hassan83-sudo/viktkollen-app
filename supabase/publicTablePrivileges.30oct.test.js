import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(
  join(root, 'supabase/migrations/20260924110000_public_table_minimum_privileges.sql'),
  'utf8',
)
const executable = sql.replace(/--[^\n]*/g, '')

const place = [
  ['place_family_members', 'select, update'],
  ['place_location_shares', 'select, insert, update'],
  ['place_e2ee_live_locations', 'select, insert, update, delete'],
  ['place_trip_shares', 'select, insert, update'],
  ['place_shared_route_points', 'select, insert, delete'],
  ['place_safety_alerts', 'select, insert'],
  ['place_safe_places', 'select, insert, update, delete'],
  ['place_voice_calls', 'select, insert, update'],
  ['place_voice_call_signals', 'select, insert'],
]

describe('SUPABASE-30OCT-B3 public privilege contract', () => {
  it('revokes every target table before granting the minimum', () => {
    for (const name of [
      ...place.map(([table]) => table),
      'reminder_push_schedules',
      'social_locations',
      'social_board_posts',
      'social_room_videos',
    ]) {
      expect(sql).toContain(
        `revoke all on table public.${name} from public, anon, authenticated, service_role;`,
      )
    }
  })

  it('grants authenticated only the verified place, reminder, and location operations', () => {
    for (const [table, privileges] of place) {
      expect(sql).toContain(`grant ${privileges} on table public.${table} to authenticated;`)
    }
    expect(sql).toContain('grant select, insert, update, delete on table public.reminder_push_schedules to authenticated;')
    expect(sql).toContain('grant select, insert, update on table public.social_locations to authenticated;')
    expect(sql).not.toContain('grant select, insert, update, delete on table public.social_locations to authenticated;')
  })

  it('keeps anon to select on the two public social tables', () => {
    expect(sql).toContain('grant select on table public.social_board_posts to anon;')
    expect(sql).toContain('grant select on table public.social_room_videos to anon;')
    expect(sql).not.toMatch(/grant (?!select on table public\.social_(board_posts|room_videos))[^;]* to anon;/i)
  })

  it('does not grant service_role or mention the legacy entitlements table', () => {
    expect(sql).not.toMatch(/user_entitlements/i)
    expect(sql).not.toMatch(/grant [^;]* to service_role;/i)
  })

  it('does not grant references, trigger, truncate, or a permissive policy', () => {
    expect(executable).not.toMatch(/\b(references|trigger|truncate)\b/i)
    expect(executable).not.toMatch(/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i)
    expect(executable).not.toMatch(/create policy|drop policy|disable row level security|drop table|delete from/i)
    expect(sql).toContain('alter policy %I on public.reminder_push_schedules to authenticated')
    expect(sql).toMatch(/DO NOT apply to production/)
  })
})
