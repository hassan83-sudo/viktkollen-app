import { waitUntil as vercelWaitUntil } from '@vercel/functions'

import { createSupabaseAdminClient } from '../supabaseServer.js'
import { classifySecurityEvent } from '../../../src/services/security/securityEvents.js'

let waitUntilOverride = null

export function setSecurityWaitUntilForTests(fn = null) {
  waitUntilOverride = fn
}

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

/**
 * Records an event after the response may already have been sent. On Vercel
 * the write is handed to waitUntil, so the function instance is kept alive
 * until it settles instead of being frozen mid-request. Never throws.
 */
export function queueSecurityEvent(input, options = {}) {
  const pending = recordSecurityEvent(input, options).catch(() => false)
  try {
    (waitUntilOverride || vercelWaitUntil)(pending)
  } catch {
    // Outside a Vercel request (tests, local scripts) the promise still runs.
  }
  return pending
}
