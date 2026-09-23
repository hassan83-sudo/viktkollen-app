import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ADMIN_AUDIT_ACTIONS, ADMIN_AUDIT_TARGET_TYPES } from './catalog.js'
import { canonicalFeatureIds } from './features.js'
import { createInMemoryCostThresholdStore } from './costThresholdStore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260922000000_billing_cost_safety.sql'), 'utf8')
const planCommercialSql = readFileSync(join(root, 'supabase/migrations/20260923130000_billing_plan_commercial_controls.sql'), 'utf8')
const sql4a = readFileSync(join(root, 'supabase/migrations/20260921220000_billing_admin_authority.sql'), 'utf8')
const sql4b = readFileSync(join(root, 'supabase/migrations/20260921230000_billing_feature_controls.sql'), 'utf8')
const postgresSrc = readFileSync(join(root, 'src/services/billing/costThresholdPostgres.js'), 'utf8')
const FEATURE_IDS = canonicalFeatureIds()

describe('BILL-4C-SEC1a threshold database security', () => {
  it('keeps the migration unapplied and non-bootstrapping', () => {
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
    expect(sql).not.toMatch(/insert into billing\.admin_permissions/i)
    expect(sql).not.toMatch(/grant_billing_admin\(/)
    expect(sql).not.toMatch(/create index concurrently/i)
  })

  it('enforces GLOBAL NULL uniqueness as a NULLS NOT DISTINCT identity constraint', () => {
    expect(sql).toMatch(/unique nulls not distinct \(scope, feature_id, period, limit_mode\)/i)
    expect(sql).toMatch(/when unique_violation then/)
    expect(sql).toMatch(/raise exception 'CONFIG_CONFLICT'/)
    expect(sql).not.toMatch(/create unique index if not exists cost_thresholds_identity_uidx/)
  })

  it('enforces scope consistency, canonical features, money, period, mode, and currency in SQL', () => {
    expect(sql).toMatch(/scope = 'GLOBAL' and feature_id is null/)
    expect(sql).toMatch(/scope = 'FEATURE' and feature_id is not null/)
    expect(FEATURE_IDS).toHaveLength(12)
    for (const id of FEATURE_IDS) {
      expect(sql).toContain(`'${id}'`)
    }
    expect(sql).toMatch(/amount_minor bigint not null/)
    expect(sql).toMatch(/amount_minor >= 0/)
    expect(sql).not.toMatch(/amount_minor (double|real|numeric|float)/i)
    expect(sql).toMatch(/currency = 'SEK'/)
    expect(sql).toMatch(/period in \('DAILY', 'MONTHLY'\)/)
    expect(sql).toMatch(/scope in \('GLOBAL', 'FEATURE'\)/)
    expect(sql).toMatch(/limit_mode in \('SOFT_ALERT', 'HARD_STOP'\)/)
    expect(sql).toMatch(/enabled boolean not null default true/)
    expect(sql).toMatch(/version integer not null/)
    expect(sql).toMatch(/version >= 1/)
  })

  it('uses DB CAS, immutable identity, and server updated_at/updated_by', () => {
    expect(sql).toMatch(/and version = p_expected_version/)
    expect(sql).toMatch(/version = existing\.version \+ 1/)
    expect(sql).toMatch(/for update/)
    expect(sql).toMatch(/cost threshold identity is immutable/)
    expect(sql).toMatch(/initial cost threshold version must be 1/)
    expect(sql).toMatch(/new\.updated_at := pg_catalog\.now\(\)/)
    expect(sql).toMatch(/updated_by = p_actor_user_id/)
    expect(sql).not.toMatch(/p_new_version/)
    expect(sql).toMatch(/cost_thresholds are not deletable/)
    expect(sql).not.toMatch(/delete from billing\.cost_thresholds/i)
  })

  it('reuses ACTIVE billing_admin and ignores client admin spoof fields', () => {
    expect(sql).toMatch(/billing\.has_billing_admin\(p_actor_user_id\)/)
    expect(sql).toMatch(/raise exception 'forbidden_admin'/)
    expect(sql).not.toMatch(/p_is_admin/)
    expect(sql).not.toMatch(/p_role/)
    expect(postgresSrc).not.toMatch(/isAdmin|billing_admin=true/)
  })

  it('keeps FORCE RLS, deny-all, SECURITY DEFINER, and RPC-only table grants', () => {
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/cost_thresholds_deny_all/)
    expect(sql).toMatch(/to public\s+using \(false\)/)
    expect(sql).toMatch(/revoke all on table billing\.cost_thresholds from public, anon, authenticated, service_role/)
    expect(sql).not.toMatch(/grant (select|insert|update|delete) on table billing\.cost_thresholds/i)
    expect(sql).toMatch(/create or replace function billing\.create_cost_threshold\([\s\S]*security definer/i)
    expect(sql).toMatch(/create or replace function billing\.update_cost_threshold\([\s\S]*security definer/i)
    expect(sql).toMatch(/create or replace function billing\.list_active_cost_thresholds\(\)[\s\S]*security definer/i)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).not.toMatch(/execute immediate|format\s*\(/i)
    expect(sql).toMatch(/grant execute on function billing\.list_active_cost_thresholds\(\) to service_role/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(postgresSrc).toMatch(/billing\.list_active_cost_thresholds\(\)/)
  })

  it('extends audit allowlists without dropping BILL-4A/4B actions or append-only', () => {
    for (const action of ADMIN_AUDIT_ACTIONS) {
      if (action.startsWith('plan.commercial.')) {
        expect(planCommercialSql).toContain(`'${action}'`)
      } else {
        expect(sql).toContain(`'${action}'`)
      }
    }
    for (const target of ADMIN_AUDIT_TARGET_TYPES) {
      if (target === 'plan_commercial') {
        expect(planCommercialSql).toContain(`'${target}'`)
      } else {
        expect(sql).toContain(`'${target}'`)
      }
    }
    expect(sql).toMatch(/'cost\.threshold\.created'/)
    expect(sql).toMatch(/'cost\.threshold\.changed'/)
    expect(sql).toMatch(/'cost_threshold'/)
    expect(sql4a).toMatch(/billing\.admin_audit is append-only/)
    expect(sql).not.toMatch(/drop trigger if exists admin_audit_guard/)
    expect(sql).not.toMatch(/delete from billing\.admin_audit/i)
    expect(sql4b).toMatch(/feature\.control\.created/)
  })

  it('keeps audit snapshots allowlisted and rejects sensitive keys', () => {
    expect(sql).toMatch(/billing\.cost_threshold_audit_payload/)
    expect(sql).toMatch(/'threshold_id', p_row\.threshold_id::text/)
    expect(sql).toMatch(/audit_sensitive_field/)
    expect(sql).toMatch(/'prompt'/)
    expect(sql).toMatch(/'api_key'/)
    expect(sql).toMatch(/'password'/)
    expect(sql).toMatch(/'audio'/)
    expect(sql).toMatch(/'image'/)
    const tableSql = sql.match(/create table if not exists billing\.cost_thresholds \([\s\S]*?\);/)[0]
    expect(tableSql).toMatch(/threshold_id|scope|feature_id|period|limit_mode|amount_minor|currency|enabled|version|updated_at|updated_by/)
    expect(tableSql).not.toMatch(/\b(prompt|response|audio|password|api_key|transcript)\b/i)
  })

  it('indexes identity, active lookup, and CAS primary key without concurrent builds', () => {
    expect(sql).toMatch(/threshold_id uuid primary key/)
    expect(sql).toMatch(/cost_thresholds_active_lookup_idx/)
    expect(sql).toMatch(/cost_thresholds_active_feature_idx/)
    expect(sql).toMatch(/cost_thresholds_identity_uidx/)
  })

  it('rejects in-memory identity mutation on CAS update', () => {
    const store = createInMemoryCostThresholdStore()
    const row = {
      amount_minor: 100,
      currency: 'SEK',
      enabled: true,
      feature_id: null,
      limit_mode: 'HARD_STOP',
      period: 'DAILY',
      scope: 'GLOBAL',
      threshold_id: '11111111-1111-4111-8111-111111111111',
      version: 1,
    }
    store.insertIfAbsent(row)
    expect(() => store.compareAndSet({
      expectedVersion: 1,
      row: { ...row, period: 'MONTHLY', version: 2 },
      thresholdId: row.threshold_id,
    })).toThrow(/identity_immutable/)
    expect(store.get(row.threshold_id).period).toBe('DAILY')
    expect(store.get(row.threshold_id).version).toBe(1)
  })
})
