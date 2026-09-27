/**
 * BILL-AI-COST-GATE-1: launch cost class per user-facing AI feature.
 * Evidence and scale estimates: docs/billing/BILL_AI_COST_GATE_1.md.
 *
 * This is classification input for the server-side gate
 * (api/_shared/billing/featureCostGate.js), not a product price list:
 *
 * - FREE_NEGLIGIBLE: local/browser, or server execution whose marginal cost
 *   stays very small at scale. No plan or quota check; the route keeps its
 *   own auth, abuse and rate limits.
 * - METERED: meaningful per-use provider cost. Goes through the existing
 *   billing engine (plan, entitlement, cost safety, quota) before any
 *   provider call. `premiumOnly` features are denied to the Free baseline
 *   plan before billing is even evaluated. Features with a Free quota keep
 *   it (existing commercial plan matrix); that is a product decision.
 * - BLOCK_UNTIL_VERIFIED: cost or product status not established. Denied for
 *   everyone until reclassified.
 *
 * A feature without an entry is BLOCK_UNTIL_VERIFIED (fail closed). A
 * METERED feature that is not registered in the billing catalog is denied
 * (no entitlement can exist for it).
 */
export const FEATURE_COST_CLASS = Object.freeze({
  BLOCK_UNTIL_VERIFIED: 'BLOCK_UNTIL_VERIFIED',
  FREE_NEGLIGIBLE: 'FREE_NEGLIGIBLE',
  METERED: 'METERED',
})

// `enforcement`: where the pre-provider gate lives today (for the audit).
export const FEATURE_COST_POLICY = Object.freeze({
  // AI Örat Ljudigenkänning + Fågelljud: Viktkollen's own Cloud Run
  // (Perch + YAMNet), scale to zero; estimated well under 1 SEK per 1,000
  // analyses. Billing already keeps it free and unmetered at launch.
  'ai.ear.interpret': Object.freeze({ costClass: FEATURE_COST_CLASS.FREE_NEGLIGIBLE, enforcement: 'route_auth_rate_limit', premiumOnly: false, status: 'live' }),
  // Dormant AI Örat providers (only on the unmerged sprint-12a branch). Not
  // registered in billing, so every request is denied until Cursor adds
  // plan entitlements and quotas.
  'ai.ear.humming': Object.freeze({ costClass: FEATURE_COST_CLASS.METERED, enforcement: 'none_route_not_on_main', premiumOnly: true, status: 'dormant' }),
  'ai.ear.music': Object.freeze({ costClass: FEATURE_COST_CLASS.METERED, enforcement: 'none_route_not_on_main', premiumOnly: true, status: 'dormant' }),
  'ai.ear.transcription': Object.freeze({ costClass: FEATURE_COST_CLASS.METERED, enforcement: 'none_route_not_on_main', premiumOnly: true, status: 'dormant' }),
  // OpenAI vision/text features with an existing Free quota in the plan matrix.
  'ai.eye.analysis': Object.freeze({ costClass: FEATURE_COST_CLASS.METERED, enforcement: 'live_billing', premiumOnly: false, status: 'live' }),
  // BILL-AI-TEXT-QUOTA-1: /api/ai and /api/adaptive-coach use live billing.
  'ai.text.request': Object.freeze({ costClass: FEATURE_COST_CLASS.METERED, enforcement: 'live_billing', premiumOnly: false, status: 'live' }),
  'body.scan': Object.freeze({ costClass: FEATURE_COST_CLASS.METERED, enforcement: 'live_billing', premiumOnly: false, status: 'live' }),
  'food.scan': Object.freeze({ costClass: FEATURE_COST_CLASS.METERED, enforcement: 'live_billing', premiumOnly: false, status: 'live' }),
  // OpenAI Realtime voice: disabled in the client, cost per minute not
  // configured. Blocked on the server until priced and gated.
  'ai.voice.session': Object.freeze({ costClass: FEATURE_COST_CLASS.BLOCK_UNTIL_VERIFIED, enforcement: 'feature_cost_gate', premiumOnly: true, status: 'disabled' }),
  // Browser speechSynthesis / SpeechRecognition: no Viktkollen server call.
  'tts.request': Object.freeze({ costClass: FEATURE_COST_CLASS.FREE_NEGLIGIBLE, enforcement: 'local_browser', premiumOnly: false, status: 'live' }),
})

const BLOCKED_UNKNOWN = Object.freeze({ costClass: FEATURE_COST_CLASS.BLOCK_UNTIL_VERIFIED, enforcement: 'none', premiumOnly: true, status: 'unknown' })

export function getFeatureCostPolicy(featureId) {
  const key = String(featureId || '').trim()
  return Object.prototype.hasOwnProperty.call(FEATURE_COST_POLICY, key) ? FEATURE_COST_POLICY[key] : BLOCKED_UNKNOWN
}
