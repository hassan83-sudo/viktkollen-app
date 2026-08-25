export const familySafetyFeature = Object.freeze({
  id: 'familySafety',
  enabledByDefault: false,
  hiddenWhenDisabled: true,
  portable: true,
  title: 'Family & Safety',
  liveTrackingReady: false,
  requires: [
    'explicit-share-opt-in',
    'native-location',
    'realtime-backend',
    'push-notifications',
    'geofencing',
    'visible-sharing-indicator',
    'immediate-stop-sharing',
    'guardian-model-for-child-accounts',
  ],
  emptyState: 'Family & Safety är en separat framtida feature. Live-platsdelning är inte aktiv.',
})

export function canExposeFamilySafety(flags = {}) {
  return flags.familySafety === true
}
