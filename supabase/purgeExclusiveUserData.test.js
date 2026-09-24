import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(root, 'migrations/20260924140000_purge_exclusive_user_data.sql'), 'utf8')
const triggerSql = readFileSync(join(root, 'migrations/20260915124145_encrypt_user_backups_with_vault_key.sql'), 'utf8')
const executable = sql.replace(/--[^\n]*/g, '')

describe('exclusive account purge', () => {
  it('keeps the backup-key trigger limited to the deleted secret id', () => {
    expect(triggerSql).toContain('delete from vault.secrets where id = old.secret_id;')
    expect(triggerSql).toContain('after delete on private.user_backup_keys')
    expect(triggerSql).toContain('execute function private.delete_user_backup_secret();')
  })

  it('deletes only the verified user rows and then the backup key', () => {
    const reminder = executable.indexOf('delete from public.reminder_push_schedules')
    const push = executable.indexOf('delete from public.place_push_subscriptions')
    const history = executable.indexOf('delete from public.place_location_history')
    const settings = executable.indexOf('delete from public.place_location_history_settings')
    const key = executable.indexOf('delete from private.user_backup_keys')

    expect(reminder).toBeGreaterThan(-1)
    expect(push).toBeGreaterThan(reminder)
    expect(history).toBeGreaterThan(push)
    expect(settings).toBeGreaterThan(history)
    expect(key).toBeGreaterThan(settings)
    expect(executable).toContain('where user_id = p_user_id')
    expect(executable).not.toMatch(/delete\s+from\s+vault\.secrets\b/i)
    expect(executable).not.toMatch(/delete\s+from\s+public\.user_backups\b/i)
    expect(executable).not.toMatch(/place_families|place_family_members|place_e2ee_|social_board_posts|social_room_videos|social_purge_user_data/i)
  })

  it('is service-role only with a fixed search path', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = pg_catalog, public')
    expect(sql).toContain('if p_user_id is null then')
    expect(sql).toContain("if auth.role() is distinct from 'service_role' then")
    expect(sql).toContain('revoke all on function public.purge_exclusive_user_data(uuid) from public;')
    expect(sql).toContain('revoke all on function public.purge_exclusive_user_data(uuid) from anon;')
    expect(sql).toContain('revoke all on function public.purge_exclusive_user_data(uuid) from authenticated;')
    expect(sql).toContain('grant execute on function public.purge_exclusive_user_data(uuid) to service_role;')
    expect(executable).not.toMatch(/grant execute on function public\.purge_exclusive_user_data\(uuid\) to (public|anon|authenticated)/i)
  })
})
