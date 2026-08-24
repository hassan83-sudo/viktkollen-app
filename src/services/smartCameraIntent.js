/**
 * Future Smart Camera hub intent.
 * Do not wire clothes/hair detection here. Body scan still uses its own
 * existing camera flow in BodyAnalysisUploader / BodyAnalysisVideoScanner.
 */
export const futureSmartCameraModes = Object.freeze([
  'body-scan',
  'outfit-style',
  'hair-appearance',
  'front-side-back-check',
  'weather-outfit',
  'food',
])

export const futureSmartCameraPrivacy = Object.freeze({
  analyzeMinimumFrames: true,
  explicitAiSend: true,
  faceProtectionOptional: true,
  livePreviewLocalOnly: true,
  noHiddenRecording: true,
  noImagesInLogs: true,
  persistVideoOnlyOnConsent: true,
  visibleCameraIndicator: true,
})

export function getExistingCameraEntryPoints() {
  return {
    bodyPhoto: 'BodyAnalysisUploader',
    bodyVideo: 'BodyAnalysisVideoScanner',
    food: 'NutritionScannerV2',
  }
}
