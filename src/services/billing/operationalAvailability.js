import { FEATURE_AVAILABILITY, OPERATIONAL_AVAILABILITY, PROVIDER_AVAILABILITY } from './catalog.js'
import { resolveFeatureAvailability } from './featureAvailability.js'
import { requiredProvidersForFeature } from './featureProviders.js'
import { indexProviderControls, resolveProviderAvailability } from './providerAvailability.js'

/**
 * Combines BILL-4B1 feature control with required-provider operational state.
 * Does not call quota, subscription, cost, or live provider APIs.
 * Does not cancel in-flight provider calls; next decision only.
 */
export function resolveOperationalAvailability({
  clientClaim = {},
  featureControl,
  featureId,
  providerControls,
  requiredProviders,
} = {}) {
  void clientClaim.providerAvailable
  void clientClaim.featureEnabled
  void clientClaim.isAdmin
  const feature = resolveFeatureAvailability({
    clientClaim,
    control: featureControl,
    featureId,
  })
  if (feature.result === FEATURE_AVAILABILITY.UNKNOWN_FEATURE) {
    return Object.freeze({
      ...feature,
      providers: [],
      result: OPERATIONAL_AVAILABILITY.UNKNOWN_FEATURE,
    })
  }
  if (feature.result === FEATURE_AVAILABILITY.DISABLED) {
    return Object.freeze({
      ...feature,
      providers: [],
      result: OPERATIONAL_AVAILABILITY.DISABLED,
    })
  }
  if (feature.result === FEATURE_AVAILABILITY.MAINTENANCE) {
    return Object.freeze({
      ...feature,
      providers: [],
      result: OPERATIONAL_AVAILABILITY.MAINTENANCE,
    })
  }

  const mapped = requiredProviders ?? requiredProvidersForFeature(feature.feature_id) ?? []
  const indexed = indexProviderControls(providerControls)
  const providers = mapped.map((providerId) => {
    const resolved = resolveProviderAvailability({
      clientClaim,
      control: indexed.get(providerId),
      providerId,
    })
    return resolved
  })

  for (const row of providers) {
    if (row.result === PROVIDER_AVAILABILITY.UNKNOWN_PROVIDER) {
      return Object.freeze({
        ...feature,
        providers,
        result: OPERATIONAL_AVAILABILITY.UNKNOWN_PROVIDER,
      })
    }
  }
  for (const row of providers) {
    if (row.result === PROVIDER_AVAILABILITY.PROVIDER_UNAVAILABLE) {
      return Object.freeze({
        ...feature,
        providers,
        result: OPERATIONAL_AVAILABILITY.PROVIDER_UNAVAILABLE,
      })
    }
  }
  for (const row of providers) {
    if (row.result === PROVIDER_AVAILABILITY.PROVIDER_MAINTENANCE) {
      return Object.freeze({
        ...feature,
        providers,
        result: OPERATIONAL_AVAILABILITY.PROVIDER_MAINTENANCE,
      })
    }
  }

  return Object.freeze({
    ...feature,
    providers,
    result: OPERATIONAL_AVAILABILITY.AVAILABLE,
  })
}
