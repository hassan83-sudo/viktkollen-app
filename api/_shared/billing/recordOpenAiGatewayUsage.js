import { defaultFeatureForGatewayType } from '../../../src/services/billing/openaiUsage.js'
import { recordProviderUsageTelemetry } from '../../../src/services/billing/providerTelemetry.js'

export async function recordOpenAiGatewayUsage({
  feature,
  model,
  providerData,
  repository,
  requestId,
  type = 'coach',
  userId = '',
} = {}) {
  return recordProviderUsageTelemetry({
    feature: feature || defaultFeatureForGatewayType(type),
    model,
    operationId: requestId,
    providerData,
    repository,
    type,
    userId,
  })
}
