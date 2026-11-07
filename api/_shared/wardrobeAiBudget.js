import { hashAiHelpScope } from './aiHelp/costGuard.js'
import { wardrobeAiConfig } from './wardrobeAiStaging.js'

// Dedicated durable Staging counter, completely separate from AI Help/Coach.
// maxCallSek is an operator-verified ceiling for the fixed model/input/output.
// Hold the FULL ceiling even for rejection, malformed output, timeout or crash.
// No reset or automatic refund; missing config/store prevents a provider call.
export async function reserveWardrobeAiBudget({ env = process.env, userId, fetchImpl = fetch } = {}) {
  const config = wardrobeAiConfig(env)
  if (!config || typeof userId !== 'string' || !userId) return { ok: false, reason: 'configuration_required' }
  try {
    const response = await fetchImpl(`${config.url}/rest/v1/rpc/wardrobe_ai_reserve_preview_call`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.service}`, apikey: config.service, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_budget_sek: config.budgetSek, p_call_sek: config.maxCallSek, p_user_hash: hashAiHelpScope(userId) }),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return { ok: false, reason: 'store_unavailable' }
    const result = await response.json()
    if (result?.ok === true && /^[0-9a-f-]{36}$/i.test(result.reservationId || '')) return { ok: true, reservationId: result.reservationId }
    return { ok: false, reason: result?.reason === 'budget' ? 'budget' : 'store_unavailable' }
  } catch { return { ok: false, reason: 'store_unavailable' } }
}
