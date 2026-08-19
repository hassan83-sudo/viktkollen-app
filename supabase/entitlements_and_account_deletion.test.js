import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/entitlements_and_account_deletion.sql', 'utf8')

describe('entitlements and account deletion SQL', () => {
  it('creates a server-owned entitlement table with RLS and no client write policy', () => {
    expect(sql).toContain('create table if not exists public.user_entitlements')
    expect(sql).toContain('alter table public.user_entitlements enable row level security')
    expect(sql).toContain('alter table public.user_entitlements force row level security')
    expect(sql).toContain('for select to authenticated')
    expect(sql).toContain('using (auth.uid() = user_id)')
    expect(sql).not.toMatch(/for\s+(insert|update|delete)\s+to\s+authenticated/i)
  })

  it('documents supported plans and statuses without embedding secrets', () => {
    expect(sql).toContain("plan in ('free', 'premium', 'trial')")
    expect(sql).toContain('trialing')
    expect(sql).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY=|service_role\s*=/i)
  })
})
