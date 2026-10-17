import { createSupabaseAdminClient } from '../supabaseServer.js'
import { classifySecurityEvent } from '../../../src/services/security/securityEvents.js'

// Server-only, fail closed: never fall back to browser or volatile memory storage.
export async function recordSecurityEvent(input, { client = createSupabaseAdminClient() } = {}) {
  const event = classifySecurityEvent(input)
  if (!event || !client || typeof client.schema !== 'function') return false
  try {
    const { data, error } = await client.schema('security_center').rpc('record_event', {
      p_type: event.type,
      p_severity: event.severity,
      p_feature: event.feature,
    })
    return !error && Number.isSafeInteger(Number(data)) && Number(data) > 0
  } catch {
    return false
  }
}
