import { FEATURE_CLASSIFICATION } from './catalog.js'
import { getFeatureDefinition, resolveFeatureId } from './features.js'

export const COST_OPERATION_KIND = Object.freeze({
  GOOGLE_CLOUD_RUN_AI_EAR: 'GOOGLE_CLOUD_RUN_AI_EAR',
  LOCAL: 'LOCAL',
  OPENAI: 'OPENAI',
  OTHER_EXTERNAL: 'OTHER_EXTERNAL',
})

/**
 * Read-only inventory of live cost-driving hops found in this repo.
 * Not a second feature registry. Canonical feature_id must already exist.
 */
export const LIVE_COST_OPERATIONS = Object.freeze([
  Object.freeze({
    actions: Object.freeze(['chat', 'daily-coach', 'weekly-report', 'proactive-coach', 'study-buddy']),
    feature_id: 'ai.text.request',
    kind: COST_OPERATION_KIND.OPENAI,
    path: 'api/ai/index.js',
    risk: 'server_openai_responses',
  }),
  Object.freeze({
    actions: Object.freeze(['realtime-session']),
    feature_id: 'ai.voice.session',
    kind: COST_OPERATION_KIND.OPENAI,
    path: 'api/ai/index.js',
    risk: 'server_openai_realtime_session',
  }),
  Object.freeze({
    actions: Object.freeze([]),
    feature_id: 'ai.text.request',
    kind: COST_OPERATION_KIND.OPENAI,
    path: 'api/adaptive-coach/index.js',
    risk: 'server_openai_responses',
  }),
  Object.freeze({
    actions: Object.freeze([]),
    feature_id: 'food.scan',
    kind: COST_OPERATION_KIND.OPENAI,
    path: 'api/nutrition-photo-analysis/index.js',
    risk: 'server_openai_vision',
  }),
  Object.freeze({
    actions: Object.freeze([]),
    feature_id: 'ai.eye.analysis',
    kind: COST_OPERATION_KIND.OPENAI,
    path: 'api/forgotten-items-analysis/index.js',
    risk: 'server_openai_vision',
  }),
  Object.freeze({
    actions: Object.freeze([]),
    feature_id: 'body.scan',
    kind: COST_OPERATION_KIND.OPENAI,
    path: 'api/body-analysis/index.js',
    via: 'src/services/bodyAnalysisAi.js',
    risk: 'server_openai_vision',
  }),
  Object.freeze({
    actions: Object.freeze([]),
    feature_id: 'ai.ear.interpret',
    kind: COST_OPERATION_KIND.GOOGLE_CLOUD_RUN_AI_EAR,
    path: 'api/ai-ear/interpret/index.js',
    risk: 'server_cloud_run_inference',
  }),
])

export const LIVE_SHARED_OPENAI_GATEWAY = 'api/_shared/openaiGateway.js'

export const LIVE_CLIENT_OPENAI_FOLLOW_ON = Object.freeze({
  feature_id: 'ai.voice.session',
  kind: COST_OPERATION_KIND.OPENAI,
  path: 'src/services/ai/realtimeVoiceController.js',
  risk: 'browser_openai_realtime_sdp',
})

export const LIVE_NON_COST_ROUTES = Object.freeze([
  Object.freeze({
    kind: COST_OPERATION_KIND.LOCAL,
    notes: 'Auth then fail-closed; never calls OpenAI.',
    path: 'api/meal-analysis/index.js',
  }),
  Object.freeze({ path: 'api/analysis-consent/index.js' }),
  Object.freeze({ path: 'api/account-deletion/index.js' }),
  Object.freeze({ path: 'api/billing/admin/index.js' }),
  Object.freeze({ path: 'api/billing/user/index.js' }),
])

export function mapLiveCostOperation({ action, path } = {}) {
  const normalizedPath = String(path || '').replaceAll('\\', '/')
  const actionName = String(action || '').trim()
  const matches = LIVE_COST_OPERATIONS.filter((row) => row.path === normalizedPath)
  if (!matches.length) return null
  if (matches.length === 1 && !matches[0].actions.length) return matches[0]
  if (actionName) {
    const byAction = matches.find((row) => row.actions.includes(actionName))
    if (byAction) return byAction
  }
  if (matches.length > 1) return null
  return matches[0]
}

export function assertCanonicalCostMapping(featureId) {
  const canonical = resolveFeatureId(featureId)
  if (!canonical || canonical !== String(featureId || '').trim()) return null
  const definition = getFeatureDefinition(canonical)
  if (!definition) return null
  if (definition.classification === FEATURE_CLASSIFICATION.LOCAL_FREE) return canonical
  return canonical
}

export function costDrivingLiveRouteCount() {
  return new Set(LIVE_COST_OPERATIONS.map((row) => row.path)).size
}
