import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertAuditPayloadSafe } from './adminAuthority.js'
import {
  FEATURE_CONTROL_REASONS,
  FEATURE_MODE,
  OPERATIONAL_AVAILABILITY,
  PROVIDER_CONTROL_REASONS,
  PROVIDER_MODE,
} from './catalog.js'
import { canonicalFeatureIds } from './features.js'
import { FEATURE_REQUIRED_PROVIDERS } from './featureProviders.js'
import { resolveOperationalAvailability } from './operationalAvailability.js'
import { canonicalProviderIds } from './providers.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260921230000_billing_feature_controls.sql'), 'utf8')
const sql4a = readFileSync(join(root, 'supabase/migrations/20260921220000_billing_admin_authority.sql'), 'utf8')
const operationalSrc = readFileSync(join(root, 'src/services/billing/operationalAvailability.js'), 'utf8')
const srcTree = readFileSync(join(root, 'src/services/supabaseClient.js'), 'utf8')

describe('BILL-4B combined security contract', () => {
  it('keeps JS canonical IDs aligned with SQL allowlists', () => {
    for (const id of canonicalFeatureIds()) {
      expect(sql).toContain(`'${id}'`)
    }
    expect(canonicalFeatureIds()).toHaveLength(12)
    expect(canonicalProviderIds()).toEqual(['openai', 'google.cloud_run.ai_ear'])
    expect(sql).toMatch(/provider_id in \(\s*'openai',\s*'google\.cloud_run\.ai_ear'\s*\)/)
    expect(FEATURE_REQUIRED_PROVIDERS['ai.ear.interpret']).toEqual(['google.cloud_run.ai_ear'])
    expect(FEATURE_REQUIRED_PROVIDERS.friend_chat).toEqual([])
    expect(FEATURE_REQUIRED_PROVIDERS['tts.request']).toEqual([])
    expect(FEATURE_REQUIRED_PROVIDERS.smart_ai).toEqual([])
  })

  it('enforces modes, reasons, CAS, uniqueness, and deny-all RLS in SQL', () => {
    expect(sql).toMatch(/mode in \('ENABLED', 'DISABLED', 'MAINTENANCE'\)/)
    expect(sql).toMatch(/mode in \('AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'\)/)
    expect(Object.values(FEATURE_MODE)).toEqual(['DISABLED', 'ENABLED', 'MAINTENANCE'])
    expect(Object.values(PROVIDER_MODE)).toEqual(['AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE'])
    expect(FEATURE_CONTROL_REASONS).toEqual(['MAINTENANCE', 'MANUAL_ADMIN', 'SECURITY'])
    expect(PROVIDER_CONTROL_REASONS).toEqual(['MAINTENANCE', 'MANUAL_ADMIN', 'PROVIDER_OUTAGE', 'SECURITY'])
    expect(sql).toMatch(/and version = expected/)
    expect(sql).toMatch(/when unique_violation then/)
    expect(sql).toMatch(/feature_controls are not deletable/)
    expect(sql).toMatch(/provider_controls are not deletable/)
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/feature_controls_deny_all/)
    expect(sql).toMatch(/provider_controls_deny_all/)
    expect(sql).not.toMatch(/insert into billing\.admin_permissions/i)
    expect(sql).not.toMatch(/alter table billing\.usage_events/i)
    expect(sql).not.toMatch(/alter table billing\.subscriptions/i)
    expect(sql).toMatch(/grant execute on function billing\.set_feature_control/)
    expect(sql).toMatch(/grant execute on function billing\.set_provider_control/)
    expect(sql).not.toMatch(/grant execute.*to (public|anon|authenticated)/i)
    expect(sql).toMatch(/revoke all on function billing\.append_admin_audit/)
    expect(sql).toMatch(/invalid_feature_mode/)
    expect(sql).toMatch(/invalid_provider_mode/)
  })

  it('extends BILL-4A audit CHECKs without dropping 4A actions or rewriting history', () => {
    expect(sql4a).toMatch(/'permission\.grant'/)
    expect(sql).toMatch(/'permission\.grant'/)
    expect(sql).toMatch(/'permission\.revoke'/)
    expect(sql).toMatch(/'feature\.control\.created'/)
    expect(sql).toMatch(/'provider\.control\.changed'/)
    expect(sql).toMatch(/'admin_permission'/)
    expect(sql).toMatch(/'feature_control'/)
    expect(sql).toMatch(/'provider_control'/)
    expect(sql).toMatch(/drop constraint if exists admin_audit_action_known/)
    expect(sql).not.toMatch(/delete from billing\.admin_audit/i)
    expect(sql).toMatch(/p_action in \('feature\.control\.created', 'feature\.control\.changed'\) and p_target_type is distinct from 'feature_control'/)
  })

  it('keeps nested/size/secret audit defenses after 4B snapshot replacement', () => {
    expect(sql).toMatch(/audit_nested_payload/)
    expect(sql).toMatch(/audit_payload_too_large/)
    expect(sql).toMatch(/audit_sensitive_field/)
    expect(sql).toMatch(/'secret'/)
    expect(sql).toMatch(/'credential'/)
    expect(() => assertAuditPayloadSafe({ secret: 'x' })).toThrow(/audit_sensitive_field/)
    expect(() => assertAuditPayloadSafe({ credential: 'x' })).toThrow(/audit_sensitive_field/)
    expect(() => assertAuditPayloadSafe({ nested: { mode: 'ENABLED' } })).toThrow(/audit_nested_payload/)
    expect(srcTree).not.toMatch(/SERVICE_ROLE|service_role/)
  })

  it('keeps operational decision order, local isolation, and no quota/cost/live wiring', () => {
    expect(resolveOperationalAvailability({ featureId: 'secret.nuke' }).result)
      .toBe(OPERATIONAL_AVAILABILITY.UNKNOWN_FEATURE)
    expect(resolveOperationalAvailability({
      featureControl: {
        feature_id: 'food.scan',
        mode: FEATURE_MODE.DISABLED,
        reason_code: 'SECURITY',
        version: 1,
      },
      featureId: 'food.scan',
      providerControls: [{
        mode: PROVIDER_MODE.AVAILABLE,
        provider_id: 'openai',
        version: 1,
      }],
    }).result).toBe(OPERATIONAL_AVAILABILITY.DISABLED)
    expect(resolveOperationalAvailability({
      featureId: 'friend_chat',
      providerControls: [{
        mode: PROVIDER_MODE.UNAVAILABLE,
        provider_id: 'openai',
        reason_code: 'PROVIDER_OUTAGE',
        version: 1,
      }],
    }).result).toBe(OPERATIONAL_AVAILABILITY.AVAILABLE)
    expect(operationalSrc).not.toMatch(/reserve|commitQuota|rollback|effectivePlan|SEK/)
    expect(sql).toMatch(/DO NOT apply to staging/)
    expect(sql).toMatch(/DO NOT apply to production/)
  })
})
