export const mouthFeature = Object.freeze({
  id: 'mouth',
  portable: true,
  title: 'Mun',
  visionReady: false,
  dependsOn: ['cameraSession', 'privacy', 'voice'],
  doesNotDependOn: ['weight', 'calories', 'body-scan-history'],
  requiresForVision: ['dedicated-vision-model'],
  emptyState: 'Munfunktionen är förberedd i Viktkollen, men ingen visuell mun- eller tandanalys är kopplad ännu. Ingen diagnos visas.',
})
