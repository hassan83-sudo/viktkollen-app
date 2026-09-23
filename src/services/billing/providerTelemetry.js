import { SENSITIVE_USAGE_FIELDS } from './catalog.js'
import { extractOpenAiUsage } from './openaiUsage.js'
import { createUsageEvent, usageEventContainsSensitiveContent } from './usageEvent.js'
import { recordUsageEvent } from './recordUsage.js'

const TELEMETRY_PREFIX = 'provider.'

export function providerTelemetryEventId(operationId) {
  const id = String(operationId || '').trim()
  if (!id) return ''
  const next = `${TELEMETRY_PREFIX}${id}`
  return next.length <= 180 ? next : next.slice(0, 180)
}

export function isProviderTelemetryEventId(eventId) {
  return String(eventId || '').startsWith(TELEMETRY_PREFIX)
}

function sensitiveKey(key) {
  const normalized = String(key || '').toLowerCase()
  return SENSITIVE_USAGE_FIELDS.some((field) => normalized === field || normalized.includes(field))
    || normalized.includes('jwt')
    || normalized.includes('service_role')
    || normalized.includes('api_key')
    || normalized.includes('authorization')
}

export function telemetryCommandIsSafe(command = {}) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return false
  return Object.keys(command).every((key) => !sensitiveKey(key))
}

function nonNegativeInteger(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

export function browserSpeechCost() {
  return Object.freeze({
    provider_cost: 'NONE',
    stored: false,
  })
}

export async function recordProviderUsageTelemetry(input = {}) {
  if (!telemetryCommandIsSafe(input)) {
    return { ok: false, reason: 'sensitive_field', stored: false }
  }
  const {
    feature,
    model = '',
    operationId,
    provider = 'openai',
    providerData = {},
    repository,
    type = 'coach',
    unit = 'tokens',
    userId = '',
  } = input
  const eventId = providerTelemetryEventId(operationId)
  if (!eventId || eventId === String(operationId || '').trim()) {
    return { ok: false, reason: 'invalid_telemetry_id', stored: false }
  }
  const usage = extractOpenAiUsage(providerData)
  const metadata = {
    cached_tokens: usage.cached_tokens,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    usage_basis: usage.usage_basis,
  }
  if (usage.image_tokens > 0) metadata.image_tokens = usage.image_tokens
  if (type === 'photo') metadata.image_count = 1
  const event = createUsageEvent({
    cost_basis: 'UNAVAILABLE',
    event_id: eventId,
    event_type: feature,
    feature,
    metadata,
    model,
    provider,
    quantity: usage.usage_basis === 'MEASURED' ? usage.total_tokens : 0,
    reference_id: String(operationId),
    unit,
    user_id: userId,
  })
  if (usageEventContainsSensitiveContent(event)) {
    return { ok: false, reason: 'sensitive_field', stored: false }
  }
  const result = await recordUsageEvent(event, repository)
  return {
    duplicate: result.duplicate === true,
    event: result.event,
    ok: result.ok === true,
    stored: result.ok === true,
  }
}

export async function recordRealtimeVoiceTelemetry(input = {}) {
  if (!telemetryCommandIsSafe(input)) {
    return { ok: false, reason: 'sensitive_field', stored: false }
  }
  const {
    durationSeconds,
    model = '',
    operationId,
    providerData = {},
    repository,
    userId = '',
  } = input
  const seconds = nonNegativeInteger(durationSeconds)
  const usage = extractOpenAiUsage(providerData)
  const measured = seconds != null && seconds > 0 || usage.usage_basis === 'MEASURED'
  const metadata = {
    cached_tokens: usage.cached_tokens,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    usage_basis: measured ? (usage.usage_basis === 'MEASURED' || seconds > 0 ? 'MEASURED' : 'UNAVAILABLE') : 'UNAVAILABLE',
    voice_seconds: seconds || 0,
  }
  if (usage.image_tokens > 0) metadata.image_tokens = usage.image_tokens
  if (seconds == null) metadata.usage_basis = 'UNAVAILABLE'
  const eventId = providerTelemetryEventId(operationId)
  const event = createUsageEvent({
    cost_basis: 'UNAVAILABLE',
    event_id: eventId,
    event_type: 'ai.voice.session',
    feature: 'ai.voice.session',
    metadata,
    model,
    provider: 'openai',
    quantity: seconds || 0,
    reference_id: String(operationId || ''),
    unit: 'seconds',
    user_id: userId,
  })
  if (usageEventContainsSensitiveContent(event)) {
    return { ok: false, reason: 'sensitive_field', stored: false }
  }
  const result = await recordUsageEvent(event, repository)
  return { duplicate: result.duplicate === true, event: result.event, ok: result.ok === true, stored: result.ok === true }
}

export async function recordGpsOperationalTelemetry(input = {}) {
  if (!telemetryCommandIsSafe(input)) {
    return { ok: false, reason: 'sensitive_field', stored: false }
  }
  const {
    historyWriteCount = 0,
    operationId,
    recipientCount = 0,
    repository,
    updateCount = 0,
    userId = '',
  } = input
  const updates = nonNegativeInteger(updateCount)
  const recipients = nonNegativeInteger(recipientCount)
  const history = nonNegativeInteger(historyWriteCount)
  if (updates == null || recipients == null || history == null) {
    return { ok: false, reason: 'invalid_counter', stored: false }
  }
  const event = createUsageEvent({
    cost_basis: 'UNAVAILABLE',
    event_id: providerTelemetryEventId(operationId),
    event_type: 'gps.live.session',
    feature: 'gps.live.session',
    metadata: {
      gps_history_write_count: history,
      gps_recipient_count: recipients,
      gps_update_count: updates,
      usage_basis: 'MEASURED',
    },
    provider: '',
    quantity: updates,
    reference_id: String(operationId),
    unit: 'writes',
    user_id: userId,
  })
  if (usageEventContainsSensitiveContent(event)) {
    return { ok: false, reason: 'sensitive_field', stored: false }
  }
  const result = await recordUsageEvent(event, repository)
  return { duplicate: result.duplicate === true, event: result.event, ok: result.ok === true, stored: result.ok === true }
}

export function aggregateProviderTelemetry(events = []) {
  const groups = new Map()
  for (const event of events) {
    if (!isProviderTelemetryEventId(event?.event_id)) continue
    const feature = String(event.feature || event.event_type || '')
    const model = String(event.model || '')
    const key = `${feature}\u0000${model}`
    const current = groups.get(key) || {
      cached_tokens: 0,
      feature,
      gps_update_count: 0,
      input_tokens: 0,
      model,
      operation_count: 0,
      output_tokens: 0,
      voice_seconds: 0,
    }
    const metadata = event.metadata || {}
    current.operation_count += 1
    current.input_tokens += Number(metadata.input_tokens) || 0
    current.output_tokens += Number(metadata.output_tokens) || 0
    current.cached_tokens += Number(metadata.cached_tokens) || 0
    current.voice_seconds += Number(metadata.voice_seconds) || (event.unit === 'seconds' ? Number(event.quantity) || 0 : 0)
    current.gps_update_count += Number(metadata.gps_update_count) || 0
    groups.set(key, current)
  }
  return [...groups.values()].sort((left, right) => left.feature.localeCompare(right.feature) || left.model.localeCompare(right.model))
}
