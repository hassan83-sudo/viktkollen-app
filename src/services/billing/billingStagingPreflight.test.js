import { describe, expect, it, vi } from 'vitest'
import {
  FORBIDDEN_TEST_METADATA_KEYS,
  INTEGRATION_MATRIX,
  applyUsageEventsMigration,
  formatBillingStagingPreflight,
  planBillingStagingIntegration,
  redactSecrets,
  runBillingStagingPreflight,
  validateBillingStagingTarget,
} from './stagingVerification.js'

const stagingEnv = {
  BILLING_TEST_STAGING_PROJECT_REF: 'abcdefghijklmnop',
  BILLING_TEST_SUPABASE_ANON_KEY: 'anon-key-value-for-tests-only',
  BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY: 'service-role-value-for-tests-only',
  BILLING_TEST_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  BILLING_TEST_TARGET: 'staging',
}

describe('BILL-1C staging preflight guards', () => {
  it('aborts safely when required env is missing and does not run SQL', async () => {
    const executeSql = vi.fn()
    const result = await runBillingStagingPreflight({
      applyMigration: true,
      env: {},
      executeSql,
      humanApproved: true,
    })
    expect(result.targetValidated).toBe(false)
    expect(result.requiredEnv).toBe('MISSING')
    expect(result.migrationExecuted).toBe(false)
    expect(executeSql).not.toHaveBeenCalled()
    expect(result.readyForHumanApprovedStagingRun).toBe(false)
  })

  it('aborts malformed URLs before mutation', async () => {
    const executeSql = vi.fn()
    const result = await applyUsageEventsMigration({
      applyMigration: true,
      env: { ...stagingEnv, BILLING_TEST_SUPABASE_URL: 'not-a-url' },
      executeSql,
      humanApproved: true,
    })
    expect(result.executed).toBe(false)
    expect(result.reason).toBe('target_invalid')
    expect(executeSql).not.toHaveBeenCalled()
  })

  it('blocks a production project ref even with human approval', async () => {
    const executeSql = vi.fn()
    const env = {
      ...stagingEnv,
      BILLING_TEST_PRODUCTION_PROJECT_REF: 'prodref123456',
      BILLING_TEST_STAGING_PROJECT_REF: 'prodref123456',
      BILLING_TEST_SUPABASE_URL: 'https://prodref123456.supabase.co',
    }
    const result = await runBillingStagingPreflight({
      applyMigration: true,
      env,
      executeSql,
      humanApproved: true,
    })
    expect(result.targetValidated).toBe(false)
    expect(result.validation.checks.some((check) => check.id === 'production-block' && check.status === 'FAIL')).toBe(true)
    expect(executeSql).not.toHaveBeenCalled()
    expect(result.migrationExecuted).toBe(false)
  })

  it('rejects supabase hosts unless an explicit staging ref matches the URL', () => {
    const result = validateBillingStagingTarget({
      ...stagingEnv,
      BILLING_TEST_STAGING_PROJECT_REF: '',
    })
    expect(result.ok).toBe(false)
    expect(result.checks.some((check) => check.id === 'staging-ref' && check.status === 'FAIL')).toBe(true)
  })

  it('skips trusted work safely when the service role is absent', async () => {
    const env = { ...stagingEnv, BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY: '' }
    const result = await runBillingStagingPreflight({ env })
    expect(result.validation.serviceRolePresent).toBe(false)
    expect(result.targetValidated).toBe(true)
    expect(result.validation.checks.some((check) => check.id === 'service-role' && check.status === 'FAIL')).toBe(true)
    expect(result.readyForHumanApprovedStagingRun).toBe(false)
    expect(result.migrationExecuted).toBe(false)
  })

  it('redacts secrets from the dry-run report', async () => {
    const result = await runBillingStagingPreflight({ env: stagingEnv })
    const report = formatBillingStagingPreflight(result, stagingEnv)
    expect(report).toMatch(/TARGET VALIDATED: YES/)
    expect(report).toMatch(/PRODUCTION BLOCK: PASS/)
    expect(report).toMatch(/REQUIRED ENV: PRESENT/)
    expect(report).toMatch(/MIGRATION: NOT EXECUTED/)
    expect(report).toMatch(/READY FOR HUMAN-APPROVED STAGING RUN: YES/)
    expect(report).not.toContain(stagingEnv.BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY)
    expect(report).not.toContain(stagingEnv.BILLING_TEST_SUPABASE_ANON_KEY)
    expect(report).toMatch(/service-role/)
    expect(redactSecrets(stagingEnv.BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY, stagingEnv)).toBe('[redacted]')
  })

  it('dry-run never executes the migration even when the target is valid', async () => {
    const executeSql = vi.fn()
    const result = await runBillingStagingPreflight({
      env: stagingEnv,
      executeSql,
    })
    expect(result.targetValidated).toBe(true)
    expect(result.migrationExecuted).toBe(false)
    expect(result.applyResult.reason).toBe('dry_run')
    expect(executeSql).not.toHaveBeenCalled()
  })

  it('accepts localhost only with BILLING_TEST_TARGET=local', () => {
    const ok = validateBillingStagingTarget({
      BILLING_TEST_SUPABASE_ANON_KEY: 'anon-key-value-for-tests-only',
      BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY: 'service-role-value-for-tests-only',
      BILLING_TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
      BILLING_TEST_TARGET: 'local',
    })
    expect(ok.ok).toBe(true)
    const blocked = validateBillingStagingTarget({
      BILLING_TEST_SUPABASE_ANON_KEY: 'anon-key-value-for-tests-only',
      BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY: 'service-role-value-for-tests-only',
      BILLING_TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
      BILLING_TEST_TARGET: 'staging',
    })
    expect(blocked.ok).toBe(false)
  })

  it('forbids VITE_ billing test keys', () => {
    const result = validateBillingStagingTarget({
      ...stagingEnv,
      VITE_BILLING_TEST_SUPABASE_ANON_KEY: 'leaked',
    })
    expect(result.ok).toBe(false)
  })
})

describe('BILL-1C integration matrix (not executed)', () => {
  it('covers anon, authenticated, service_role, constraints, privacy, and PostgREST', () => {
    const ids = INTEGRATION_MATRIX.map((item) => item.id)
    expect(ids).toEqual(expect.arrayContaining([
      'anon-select',
      'anon-insert',
      'anon-update',
      'anon-delete',
      'authenticated-select',
      'authenticated-insert',
      'authenticated-update',
      'authenticated-delete',
      'service-role-insert',
      'service-role-update',
      'service-role-delete',
      'append-only-update',
      'append-only-delete',
      'idempotency-second-insert',
      'concurrent-same-event-id',
      'negative-quantity',
      'unknown-unit',
      'unknown-event-type',
      'forbidden-metadata',
      'allowlisted-metadata',
      'cross-user-raw-select',
      'postgrest-billing-schema',
    ]))
    expect(planBillingStagingIntegration().testUsers.createInThisSprint).toBe(false)
    FORBIDDEN_TEST_METADATA_KEYS.forEach((key) => {
      expect(planBillingStagingIntegration().forbiddenMetadataKeys).toContain(key)
    })
    expect(planBillingStagingIntegration().validMetadataExample.input_tokens).toBe(1)
  })
})
