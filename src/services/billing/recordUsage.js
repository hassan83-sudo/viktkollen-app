import { createUsageEvent, usageEventContainsSensitiveContent } from './usageEvent.js'
import { getUsageRepository } from './usageRepository.js'

/**
 * Fail-open: metering errors never throw to the caller.
 * Duplicate event_id is treated as success without a second insert.
 */
export async function recordUsageEvent(input, repository = getUsageRepository()) {
  try {
    const event = createUsageEvent(input)
    if (usageEventContainsSensitiveContent(event)) {
      return { ok: false, reason: 'sensitive_content_blocked' }
    }
    const result = await repository.insert(event)
    return {
      duplicate: result.duplicate === true,
      event: result.event,
      ok: true,
    }
  } catch (error) {
    return {
      ok: false,
      reason: error?.code || 'record_failed',
    }
  }
}

export function recordUsageEventSync(input, repository = getUsageRepository()) {
  return Promise.resolve(recordUsageEvent(input, repository))
}
