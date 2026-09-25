import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = 'supabase/account_deletion_staging'
const files = readdirSync(dir).filter((name) => name.endsWith('.sql') || name.endsWith('.md'))
const source = files.map((name) => readFileSync(`${dir}/${name}`, 'utf8')).join('\n')
const bootstrap = readFileSync(`${dir}/00_bootstrap.sql`, 'utf8')
const readme = readFileSync(`${dir}/README.md`, 'utf8')

const tables = [
  'place_families',
  'place_family_members',
  'social_messages',
  'social_conversation_members',
  'social_dm_pairs',
  'social_location_envelopes',
  'social_locations',
  'social_friend_requests',
  'social_friendships',
  'social_blocks',
  'social_public_profiles',
  'user_sync_items',
  'user_sync_events',
  'user_sync_state',
  'user_backups',
  'user_backup_keys',
  'reminder_push_schedules',
  'place_push_subscriptions',
  'place_location_history',
  'place_location_history_settings',
  'place_location_shares',
  'place_e2ee_live_locations',
  'place_voice_call_signals',
  'place_voice_calls',
]

describe('account deletion staging bootstrap', () => {
  it('includes the required tables and purge functions', () => {
    for (const table of tables) expect(bootstrap).toContain(table)
    for (const name of [
      'social_purge_user_data',
      'purge_exclusive_user_data',
      'purge_place_participation',
      'purge_family_membership',
      'purge_account_user_data',
    ]) {
      const migration = readdirSync('supabase/migrations').find((file) => file.includes(name) || (name === 'social_purge_user_data' && file.includes('social_purge')))
      const text = readFileSync(`supabase/migrations/${migration}`, 'utf8').replace(/\r\n/g, '\n').trim()
      expect(bootstrap.replace(/\r\n/g, '\n')).toContain(text)
    }
  })

  it('matches the voice-call and family constraints from catalog metadata', () => {
    expect(bootstrap).toContain('constraint place_voice_calls_different_users check (caller_user_id <> callee_user_id)')
    expect(bootstrap).toContain("status = any (array['ringing'::text, 'accepted'::text, 'ended'::text, 'declined'::text])")
    expect(bootstrap).toContain('create index if not exists place_voice_calls_users_idx')
    expect(bootstrap).toContain('id bigint generated always as identity primary key')
    expect(bootstrap).toContain('references public.place_voice_calls(id) on delete cascade')
    expect(bootstrap).toContain('place_family_members_one_family_per_user')
    expect(bootstrap).toContain("array['guardian'::text, 'member'::text]")
    expect(bootstrap).not.toMatch(/create\s+(or replace\s+)?function\s+public\.viktkollen_is_place_family_member/i)
    expect(bootstrap).not.toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.place_trip_shares/i)
  })

  it('keeps failure injection test-only and contains no secrets or auth deletion', () => {
    const injection = readFileSync(`${dir}/02_failure_injection.sql`, 'utf8')
    const cleanup = readFileSync(`${dir}/03_cleanup_failure_injection.sql`, 'utf8')
    expect(injection).toContain('TEST ONLY')
    expect(injection).toContain('account_deletion_test_only_fail_policy_c')
    expect(injection).toContain('account_deletion_test_only_fail_sync')
    expect(injection).toContain('account_deletion_test_only_fail_f13')
    expect(injection).toContain('account_deletion_test_only_fail_f14')
    expect(cleanup).toContain('drop trigger if exists account_deletion_test_only_fail_policy_c')
    expect(source).not.toMatch(/auth\.admin\.deleteUser\s*\(/i)
    expect(source).not.toMatch(/postgres(?:ql)?:\/\//i)
    expect(source).not.toMatch(/supabase\.co/i)
    expect(source).not.toMatch(/service_role_key|BEGIN RSA|eyJ/i)
    expect(readme).toContain('NEVER RUN AGAINST PRODUCTION')
    expect(readme).toContain('NEVER RUN AGAINST BILLING-STAGING')
    expect(readme).toContain('not a complete reproduction of Production authorization/RLS')
    expect(readme).toContain('00_bootstrap.sql')
    expect(readme).toContain('01_test_data.sql')
    expect(readme).toContain('02_failure_injection.sql')
    expect(readme).toContain('03_cleanup_failure_injection.sql')
    expect(readme).toContain('04_verification.sql')
  })

  it('hardens the harness without setting its own environment marker', () => {
    const sqlNames = ['00_bootstrap.sql', '01_test_data.sql', '02_failure_injection.sql', '03_cleanup_failure_injection.sql', '04_verification.sql']
    for (const name of sqlNames) {
      const sql = readFileSync(`${dir}/${name}`, 'utf8')
      expect(sql).toContain("current_setting('viktkollen.account_deletion_harness', true) is distinct from 'isolated-app-staging'")
      expect(sql).not.toMatch(/set_config\(\s*'viktkollen\.account_deletion_harness'/i)
      expect(sql).not.toMatch(/set\s+viktkollen\.account_deletion_harness\s*=/i)
    }
    const injection = readFileSync(`${dir}/02_failure_injection.sql`, 'utf8')
    expect(injection).toContain('missing or unknown viktkollen.account_deletion_failure_point')
    expect(injection).toContain("failure_point = 'policy_c'")
    expect(injection).toContain("failure_point = 'sync'")
    expect(injection).toContain("failure_point = 'f13'")
    expect(injection).toContain("failure_point = 'f14'")
    const fixtures = readFileSync(`${dir}/01_test_data.sql`, 'utf8')
    expect(fixtures).toMatch(/\bbegin\s*;/i)
    expect(fixtures).toMatch(/\bcommit\s*;/i)
    expect(fixtures.indexOf('disable trigger')).toBeLessThan(fixtures.indexOf('enable trigger'))
    expect(fixtures).toContain('vault.create_secret')
    expect(fixtures).toContain('f26-synthetic-account-deletion-backup-key')
    const verification = readFileSync(`${dir}/04_verification.sql`, 'utf8')
    expect(verification).toContain('raise exception')
    expect(verification).toContain('synthetic vault secret missing')
    expect(verification).toContain('success failed: created_by is not B')
    expect(verification).toContain('second run failed: A membership returned')
    expect(verification).toContain('auth user A was deleted')
    expect(verification).toContain('account_deletion_test_only_fail_f14')
    expect(readme).toContain('service_role')
    expect(readme).toContain('/rest/v1/rpc/purge_account_user_data')
    const cleanup = readFileSync(`${dir}/03_cleanup_failure_injection.sql`, 'utf8')
    expect(cleanup).toContain('account_deletion_test_only_fail_policy_c')
    expect(cleanup).toContain('account_deletion_test_only_fail_sync')
    expect(cleanup).toContain('account_deletion_test_only_fail_f13')
    expect(cleanup).toContain('account_deletion_test_only_fail_f14')
    expect(cleanup).toContain("name = 'f26-synthetic-account-deletion-backup-key'")
  })
})
