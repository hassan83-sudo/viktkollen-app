export const eyesFeature = Object.freeze({
  id: 'eyes',
  portable: true,
  title: 'Ögon',
  visionReady: false,
  dependsOn: ['cameraSession', 'privacy', 'voice'],
  doesNotDependOn: ['weight', 'calories', 'body-scan-history'],
  requiresForVision: ['dedicated-vision-model'],
  emptyState: 'Ögonfunktionen är förberedd i Viktkollen, men ingen visuell ögonanalys är kopplad ännu. Ingen diagnos visas.',
})
