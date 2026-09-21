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
})
