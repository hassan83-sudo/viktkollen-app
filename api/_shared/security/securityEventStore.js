import { createSupabaseAdminClient } from '../supabaseServer.js'
import { classifySecurityEvent } from '../../../src/services/security/securityEvents.js'

// Server-only, fail closed: never fall back to browser or volatile memory storage.
export async function recordSecurityEvent(input, { client } = {}) {
  const event = classifySecurityEvent(input)
  if (!event) return false
  try {
    const store = client === undefined ? createSupabaseAdminClient() : client
    if (!store || typeof store.rpc !== 'function') return false
    const { data, error } = await store.rpc('security_center_record_event', {
      p_type: event.type,
      p_severity: event.severity,
      p_feature: event.feature,
    })
    return !error && Number.isSafeInteger(Number(data)) && Number(data) > 0
  } catch {
    return false
  }
}
