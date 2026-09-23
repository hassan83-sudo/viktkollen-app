import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SENSITIVE_USAGE_FIELDS, USAGE_EVENT_TYPES, USAGE_METADATA_ALLOWLIST, USAGE_UNITS } from './catalog.js'
import { createUsageEvent, sanitizeUsageMetadata, toPersistedUsageRow } from './usageEvent.js'
import { recordUsageEvent } from './recordUsage.js'
import { createInMemoryUsageRepository } from './usageRepository.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(join(root, 'supabase/migrations/20260921121500_billing_usage_events.sql'), 'utf8')
const telemetrySql = readFileSync(join(root, 'supabase/migrations/20260923140000_billing_usage_telemetry.sql'), 'utf8')
const srcTree = readFileSync(join(root, 'src/services/supabaseClient.js'), 'utf8')
const viteConfig = readFileSync(join(root, 'vite.config.js'), 'utf8')
const envExample = readFileSync(join(root, '.env.example'), 'utf8')

const validEvent = {
  event_id: 'ai-bill1a-1',
  event_type: 'ai.text.request',
  feature: 'ai.text.request',
  model: 'gpt-4.1-mini',
  occurred_at: '2026-04-01T12:00:00.000Z',
  provider: 'openai',
  quantity: 1,
  unit: 'requests',
  user_id: '11111111-1111-4111-8111-111111111111',
}

describe('BILL-1A usage_events migration static security', () => {
  it('enables FORCE RLS and deny-all client access', () => {
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/force row level security/)
    expect(sql).toMatch(/revoke all on schema billing from public, anon, authenticated/)
    expect(sql).toMatch(/revoke all privileges on table billing\.usage_events from public, anon, authenticated/)
    expect(sql).toMatch(/as restrictive/)
    expect(sql).toMatch(/using \(false\)/)
    expect(sql).toMatch(/with check \(false\)/)
    expect(sql).not.toMatch(/to authenticated/)
    expect(sql).not.toMatch(/to anon/)
    expect(sql).not.toMatch(/grant (all|select|insert|update|delete).*authenticated/i)
  })

  it('grants trusted server insert/select only and blocks update/delete', () => {
    expect(sql).toMatch(/grant select, insert on table billing\.usage_events to service_role/)
    expect(sql).toMatch(/revoke update, delete on table billing\.usage_events from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/billing\.usage_events is append-only/)
    expect(sql).toMatch(/before update or delete/)
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/)
    expect(sql).not.toMatch(/security definer/i)
  })

  it('enforces quantity, known type/unit, and global event_id uniqueness', () => {
    expect(sql).toMatch(/event_id text primary key/)
    expect(sql).toMatch(/quantity integer not null/)
    expect(sql).toMatch(/quantity >= 0/)
    expect(sql).not.toMatch(/quantity > 0/)
    USAGE_EVENT_TYPES.forEach((type) => expect(sql).toContain(`'${type}'`))
    USAGE_UNITS.forEach((unit) => expect(sql).toContain(`'${unit}'`))
    expect(sql).toContain("'ESTIMATED'")
    expect(sql).toContain("'UNAVAILABLE'")
    expect(telemetrySql).toContain("'MEASURED'")
    expect(telemetrySql).toMatch(/DO NOT apply to production/)
  })

  it('restricts metadata to the privacy allowlist and has no payload columns', () => {
    const ddl = sql
      .replace(/--[^\n]*/g, '')
      .replace(/comment on[\s\S]*?;/gi, '')
    USAGE_METADATA_ALLOWLIST.forEach((key) => expect(`${sql}\n${telemetrySql}`).toContain(`'${key}'`))
    expect(sql).toMatch(/jsonb_typeof\(metadata\) = 'object'/)
    expect(ddl).not.toMatch(/\bpayload\b/)
    expect(ddl).not.toMatch(/\bcontext\b/)
    expect(ddl).not.toMatch(/double precision|float4|float8|\breal\b/)
    expect(ddl).not.toMatch(/price_minor|sek_ore|\bcurrency\b/)
    SENSITIVE_USAGE_FIELDS.forEach((field) => {
      expect(ddl).not.toMatch(new RegExp(`^\\s*${field}\\s`, 'm'))
    })
  })

  it('indexes user+time and event_type+time without a redundant event_id unique index', () => {
    expect(sql).toMatch(/usage_events_user_occurred_idx/)
    expect(sql).toMatch(/\(user_id, occurred_at desc\)/)
    expect(sql).toMatch(/usage_events_type_occurred_idx/)
    expect(sql).toMatch(/\(event_type, occurred_at desc\)/)
    expect(sql).not.toMatch(/usage_events_event_id_uidx/)
  })

  it('keeps economic timestamp and documents server-derived user_id', () => {
    expect(sql).toMatch(/occurred_at timestamptz not null default now\(\)/)
    expect(sql).toMatch(/created_at timestamptz not null default now\(\)/)
    expect(sql).toMatch(/Never trust a client-supplied user_id/)
  })
})

describe('BILL-1A client/service-role exposure (static)', () => {
  it('does not put service role in the Vite client env surface', () => {
    expect(srcTree).toMatch(/VITE_SUPABASE_ANON_KEY/)
    expect(srcTree).not.toMatch(/SERVICE_ROLE|serviceRole|service_role/)
    expect(viteConfig).not.toMatch(/SERVICE_ROLE/)
    expect(envExample).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=$/m)
    expect(envExample).not.toMatch(/VITE_SUPABASE_SERVICE_ROLE/)
  })
})

describe('BILL-1A application contract vs SQL', () => {
  it('blocks negative quantity and unknown unit before any persist mapper', () => {
    expect(() => createUsageEvent({ ...validEvent, quantity: -1 })).toThrow(/invalid_quantity/)
    expect(() => createUsageEvent({ ...validEvent, quantity: Number.NaN })).toThrow(/invalid_quantity/)
    expect(() => createUsageEvent({ ...validEvent, unit: 'minutes' })).toThrow(/invalid_unit/)
    expect(() => createUsageEvent({ ...validEvent, event_type: 'payment.charge' })).toThrow(/invalid_event_type/)
  })

  it('drops unknown fields and sensitive metadata instead of persisting them', () => {
    const event = createUsageEvent({
      ...validEvent,
      extra_cost: 999,
      metadata: {
        api_key: 'sk-test',
        prompt: 'hej',
        unknown: true,
        input_tokens: 4,
      },
      payload: { prompt: 'nope' },
    })
    expect(event.metadata).toEqual({ input_tokens: 4 })
    expect(event).not.toHaveProperty('payload')
    expect(event).not.toHaveProperty('extra_cost')
    expect(sanitizeUsageMetadata({ transcript: 'x', audio_url: 'y', input_tokens: 1 })).toEqual({
      input_tokens: 1,
    })
  })

  it('maps only uuid user_id onto the SQL row and nulls forged identifiers', () => {
    expect(toPersistedUsageRow(createUsageEvent(validEvent)).user_id).toBe(validEvent.user_id)
    expect(toPersistedUsageRow(createUsageEvent({ ...validEvent, user_id: 'other-user' })).user_id).toBeNull()
    expect(toPersistedUsageRow(createUsageEvent({ ...validEvent, user_id: '' })).user_id).toBeNull()
  })

  it('treats duplicate event_id as a single authoritative event (application idempotency)', async () => {
    const repo = createInMemoryUsageRepository()
    const first = await recordUsageEvent({ ...validEvent, quantity: 1 }, repo)
    const retry = await recordUsageEvent({ ...validEvent, quantity: 50, provider: 'other' }, repo)
    expect(first.ok).toBe(true)
    expect(retry.ok).toBe(true)
    expect(retry.duplicate).toBe(true)
    expect((await repo.list()).length).toBe(1)
    expect((await repo.getByEventId(validEvent.event_id)).quantity).toBe(1)
    expect((await repo.getByEventId(validEvent.event_id)).provider).toBe('openai')
  })

  it('fails open without throwing when metering input is invalid', async () => {
    const result = await recordUsageEvent({ ...validEvent, quantity: -8 })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('invalid_quantity')
  })
})
