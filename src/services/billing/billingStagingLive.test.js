import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classifyRestAccess, splitSqlStatements, validUsageRow } from './stagingLive.js'
import { validateBillingStagingTarget } from './stagingVerification.js'

describe('BILL-1D staging live helpers', () => {
  it('classifies PostgREST schema denial as blocked', () => {
    expect(classifyRestAccess(404, 'PGRST106')).toBe('blocked')
    expect(classifyRestAccess(403, 'permission denied')).toBe('blocked')
    expect(classifyRestAccess(201, '')).toBe('allowed')
  })

  it('builds synthetic usage rows without sensitive keys', () => {
    const row = validUsageRow('sample')
    expect(row.event_id.startsWith('bill1d-')).toBe(true)
    expect(row.metadata).not.toHaveProperty('prompt')
    expect(row.quantity).toBe(1)
  })

  it('still blocks a production-ref target in unit tests', () => {
    const result = validateBillingStagingTarget({
      BILLING_TEST_PRODUCTION_PROJECT_REF: 'prodref123456',
      BILLING_TEST_STAGING_PROJECT_REF: 'prodref123456',
      BILLING_TEST_SUPABASE_ANON_KEY: 'anon-key-value-for-tests-only',
      BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY: 'service-role-value-for-tests-only',
      BILLING_TEST_SUPABASE_URL: 'https://prodref123456.supabase.co',
      BILLING_TEST_TARGET: 'staging',
    })
    expect(result.ok).toBe(false)
  })

  it('splits dollar-quoted migration SQL into statements', () => {
    const statements = splitSqlStatements(`
      create schema if not exists billing;
      create or replace function billing.reject_usage_event_mutation()
      returns trigger language plpgsql as $$
      begin
        raise exception 'billing.usage_events is append-only';
      end;
      $$;
    `)
    expect(statements).toHaveLength(2)
    expect(statements[1]).toContain('raise exception')
  })
})

describe('BILL-3B staging runner contract', () => {
  it('loads gitignored staging env only and never production env files', () => {
    const source = readFileSync(new URL('../../../scripts/run-billing-staging-3b.mjs', import.meta.url), 'utf8')
    expect(source).toContain('.env.local')
    expect(source).not.toContain('.env.production.local')
    expect(source).toContain('20260921200000_billing_subscriptions.sql')
    expect(source).toContain('TWO_REAL_POSTGRES_SESSIONS')
    expect(source).toContain('duplicate_open_subscription')
  })
})

describe('BILL-4A staging runner contract', () => {
  it('loads gitignored staging env only and never production env files', () => {
    const source = readFileSync(new URL('../../../scripts/run-billing-staging-4a.mjs', import.meta.url), 'utf8')
    expect(source).toContain('.env.local')
    expect(source).not.toContain('.env.production.local')
    expect(source).toContain('20260921220000_billing_admin_authority.sql')
    expect(source).toContain('TWO_REAL_POSTGRES_SESSIONS')
    expect(source).toContain('grant_billing_admin')
    expect(source).toContain('verifySupabaseUser')
  })
})
