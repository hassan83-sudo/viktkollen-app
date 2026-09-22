import { defaultFeatureForGatewayType, extractOpenAiUsage } from '../../../src/services/billing/openaiUsage.js'
import { recordUsageEvent } from '../../../src/services/billing/recordUsage.js'

function featureToEventType(feature) {
  if (feature === 'food.scan' || feature === 'ai.eye.analysis' || feature === 'ai.voice.session' || feature === 'ai.text.request') {
    return feature
  }
  return 'ai.text.request'
}

export async function recordOpenAiGatewayUsage({
  feature,
  model,
  providerData,
  repository,
  requestId,
  type = 'coach',
  userId = '',
} = {}) {
  const resolvedFeature = feature || defaultFeatureForGatewayType(type)
  const usage = extractOpenAiUsage(providerData)
  return recordUsageEvent({
    cost_basis: 'UNAVAILABLE',
    event_id: requestId,
    event_type: featureToEventType(resolvedFeature),
    feature: resolvedFeature,
    metadata: {
      cached_tokens: usage.cached_tokens,
      image_count: type === 'photo' ? 1 : 0,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens,
      usage_basis: usage.usage_basis,
    },
    model,
    provider: 'openai',
    quantity: 1,
    reference_id: requestId,
    unit: resolvedFeature === 'ai.voice.session' ? 'sessions' : 'requests',
    user_id: userId,
  }, repository)
}
