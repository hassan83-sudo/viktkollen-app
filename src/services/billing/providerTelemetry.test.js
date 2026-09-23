import { afterEach, describe, expect, it } from 'vitest'
import handler from '../../../api/billing/admin/index.js'
import {
  setBillingAdminControlsForTests,
  setBillingAdminServiceForTests,
} from '../../../api/_shared/billing/admin.js'
import { setSupabaseAuthVerifierForTests } from '../../../api/_shared/verifySupabaseUser.js'
import { createQuotaEngine } from './quotaEngine.js'
import { createInMemoryUsageRepository, setUsageRepositoryForTests } from './usageRepository.js'
import {
  aggregateProviderTelemetry,
  browserSpeechCost,
  recordGpsOperationalTelemetry,
  recordProviderUsageTelemetry,
  recordRealtimeVoiceTelemetry,
} from './providerTelemetry.js'

const USER = '22222222-2222-4222-8222-222222222222'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const FORBIDDEN = ['api_key', 'audio', 'coordinates', 'image', 'jwt', 'latitude', 'longitude', 'prompt', 'response', 'service_role', 'transcript']

function createRequest({ method = 'GET', query = {}, token = '' } = {}) {
  return {
    body: {},
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
    query,
  }
}

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) {
      this.body = body
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
  }
}

describe('BILL-6B2C provider usage telemetry', () => {
  afterEach(() => {
    setUsageRepositoryForTests()
    setBillingAdminServiceForTests(null)
    setBillingAdminControlsForTests(undefined)
    setSupabaseAuthVerifierForTests(null)
  })

  it('keeps one food.scan quota identity and one idempotent provider record', async () => {
    const repository = createInMemoryUsageRepository()
    const quota = createQuotaEngine({ usageRepository: repository })
    const operationId = 'op_foodtelemetry000000000000000001'
    await repository.insert({
      cost_basis: 'UNAVAILABLE',
      event_id: operationId,
      event_type: 'food.scan',
      feature: 'food.scan',
      metadata: { image_count: 1, usage_basis: 'UNAVAILABLE' },
      occurred_at: new Date().toISOString(),
      provider: 'openai',
      quantity: 1,
      reference_id: operationId,
      unit: 'requests',
      user_id: USER,
    })
    const reserved = await quota.reserveQuota({
      feature: 'food.scan',
      quantity: 1,
      reservation_id: operationId,
      unit: 'requests',
      user: USER,
    })
    expect(reserved.reservation_id).toBe(operationId)
    await quota.commitReservation({ actual_quantity: 1, reservation_id: operationId })
    const first = await recordProviderUsageTelemetry({
      feature: 'food.scan',
      model: 'gpt-4.1-mini',
      operationId,
      providerData: {
        output_text: 'secret meal analysis',
        usage: {
          input_tokens: 11,
          input_tokens_details: { cached_tokens: 2, image_tokens: 8 },
          output_tokens: 7,
          total_tokens: 18,
        },
      },
      repository,
      type: 'photo',
      userId: USER,
    })
    const second = await recordProviderUsageTelemetry({
      feature: 'food.scan',
      model: 'gpt-4.1-mini',
      operationId,
      providerData: { usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 } },
      repository,
      type: 'photo',
      userId: USER,
    })
    expect(first.ok).toBe(true)
    expect(second.duplicate).toBe(true)
    const events = await repository.list()
    const quotaRows = events.filter((event) => event.unit === 'requests')
    const telemetry = events.find((event) => event.event_id === `provider.${operationId}`)
    expect(quotaRows).toHaveLength(1)
    expect(quotaRows[0].quantity).toBe(1)
    expect(telemetry.reference_id).toBe(operationId)
    expect(telemetry.event_id).not.toBe(operationId)
    expect(telemetry.metadata.input_tokens).toBe(11)
    expect(telemetry.metadata.cached_tokens).toBe(2)
    expect(telemetry.metadata.image_tokens).toBe(8)
    expect(telemetry.metadata.output_tokens).toBe(7)
    expect(telemetry.metadata.total_tokens).toBe(18)
    expect(telemetry.metadata.usage_basis).toBe('MEASURED')
    expect(telemetry.cost_basis).toBe('UNAVAILABLE')
    expect(JSON.stringify(telemetry)).not.toMatch(/secret meal analysis/)
    const inspected = await quota.inspectQuota({ feature: 'food.scan', unit: 'requests', userId: USER })
    expect(inspected.used).toBe(1)
  })

  it('persists AI text token metadata and treats missing usage as UNAVAILABLE', async () => {
    const repository = createInMemoryUsageRepository()
    const recorded = await recordProviderUsageTelemetry({
      feature: 'ai.text.request',
      model: 'gpt-5.6-luna',
      operationId: 'ai-text-1',
      providerData: {
        prompt: 'private chat',
        usage: { input_tokens: 4, input_tokens_details: { cached_tokens: 1 }, output_tokens: 3, total_tokens: 7 },
      },
      repository,
      userId: USER,
    })
    const missing = await recordProviderUsageTelemetry({
      feature: 'ai.text.request',
      model: 'gpt-5.6-luna',
      operationId: 'ai-text-missing',
      providerData: { output_text: 'still not stored' },
      repository,
      userId: USER,
    })
    expect(recorded.event.metadata.input_tokens).toBe(4)
    expect(recorded.event.metadata.cached_tokens).toBe(1)
    expect(recorded.event.metadata.output_tokens).toBe(3)
    expect(recorded.event.metadata.total_tokens).toBe(7)
    expect(recorded.event.cost_basis).toBe('UNAVAILABLE')
    expect(recorded.event.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(missing.event.metadata.usage_basis).toBe('UNAVAILABLE')
    expect(missing.event.cost_basis).toBe('UNAVAILABLE')
    expect(missing.event.quantity).toBe(0)
    expect(JSON.stringify(await repository.list())).not.toMatch(/private chat|still not stored/)
  })

  it('classifies browser speech as no provider cost and can record realtime duration', async () => {
    const repository = createInMemoryUsageRepository()
    const browser = browserSpeechCost()
    expect(browser.provider_cost).toBe('NONE')
    expect(browser.stored).toBe(false)
    expect(await repository.list()).toHaveLength(0)
    const voice = await recordRealtimeVoiceTelemetry({
      durationSeconds: 42,
      model: 'gpt-4o-mini-realtime-preview',
      operationId: 'voice-1',
      providerData: { usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } },
      repository,
      userId: USER,
    })
    const unknown = await recordRealtimeVoiceTelemetry({
      model: 'gpt-4o-mini-realtime-preview',
      operationId: 'voice-unknown',
      repository,
      userId: USER,
    })
    expect(voice.event.unit).toBe('seconds')
    expect(voice.event.quantity).toBe(42)
    expect(voice.event.metadata.voice_seconds).toBe(42)
    expect(voice.event.provider).toBe('openai')
    expect(voice.event.cost_basis).toBe('UNAVAILABLE')
    expect(unknown.event.metadata.usage_basis).toBe('UNAVAILABLE')
    expect(unknown.event.quantity).toBe(0)
  })

  it('records GPS counters without coordinates', async () => {
    const repository = createInMemoryUsageRepository()
    const recorded = await recordGpsOperationalTelemetry({
      historyWriteCount: 1,
      operationId: 'gps-1',
      recipientCount: 3,
      repository,
      updateCount: 1,
      userId: USER,
    })
    const rejected = await recordGpsOperationalTelemetry({
      historyWriteCount: 1,
      latitude: 59.3,
      longitude: 18.1,
      operationId: 'gps-secret',
      recipientCount: 1,
      repository,
      updateCount: 1,
      userId: USER,
    })
    expect(recorded.event.metadata.gps_update_count).toBe(1)
    expect(recorded.event.metadata.gps_recipient_count).toBe(3)
    expect(recorded.event.metadata.gps_history_write_count).toBe(1)
    expect(recorded.event.unit).toBe('writes')
    expect(rejected.stored).toBe(false)
    const serialized = JSON.stringify(await repository.list())
    expect(serialized).not.toMatch(/59\.3|18\.1|latitude|longitude|coordinates/)
    expect((await repository.list()).some((event) => event.event_id === 'provider.gps-secret')).toBe(false)
  })

  it('rejects sensitive payload fields before storage', async () => {
    const repository = createInMemoryUsageRepository()
    for (const field of FORBIDDEN) {
      const result = await recordProviderUsageTelemetry({
        feature: 'ai.text.request',
        model: 'gpt-4.1-mini',
        operationId: `blocked-${field}`,
        [field]: 'secret',
        providerData: { usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
        repository,
        userId: USER,
      })
      expect(result.stored).toBe(false)
    }
    expect(await repository.list()).toHaveLength(0)
  })

  it('aggregates telemetry for an admin and denies ordinary users', async () => {
    const repository = createInMemoryUsageRepository()
    setUsageRepositoryForTests(repository)
    await recordProviderUsageTelemetry({
      feature: 'ai.text.request',
      model: 'gpt-4.1-mini',
      operationId: 'ai-admin-1',
      providerData: { usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } },
      repository,
      userId: USER,
    })
    await recordGpsOperationalTelemetry({
      historyWriteCount: 0,
      operationId: 'gps-admin-1',
      recipientCount: 2,
      repository,
      updateCount: 4,
      userId: USER,
    })
    const summaries = aggregateProviderTelemetry(await repository.list())
    expect(summaries.find((row) => row.feature === 'ai.text.request').input_tokens).toBe(5)
    expect(summaries.find((row) => row.feature === 'gps.live.session').gps_update_count).toBe(4)
    expect(JSON.stringify(summaries)).not.toMatch(/user_id|prompt|latitude/)

    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'admin-token' ? { user: { id: ADMIN } } : { user: { id: USER } }
    ))
    setBillingAdminServiceForTests({
      hasBillingAdmin: async (userId) => userId === ADMIN,
    })

    const anonymous = createResponse()
    await handler(createRequest({ query: { resource: 'usage_telemetry' } }), anonymous)
    expect(anonymous.statusCode).toBe(401)

    const ordinary = createResponse()
    await handler(createRequest({ query: { resource: 'usage_telemetry' }, token: 'user-token' }), ordinary)
    expect(ordinary.statusCode).toBe(403)

    const admin = createResponse()
    await handler(createRequest({ query: { resource: 'usage_telemetry' }, token: 'admin-token' }), admin)
    expect(admin.statusCode).toBe(200)
    expect(admin.body.summaries.find((row) => row.feature === 'ai.text.request').output_tokens).toBe(2)
    expect(admin.body.events).toBeUndefined()
    expect(JSON.stringify(admin.body)).not.toMatch(/prompt|latitude|Bearer|sk-/)
  })
})
