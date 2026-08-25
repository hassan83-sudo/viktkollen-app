import { isFeatureEnabled } from '../featureRegistry.js'
import { smartCameraPrivacyRules } from '../shared/privacy/privacyLayers.js'

export const smartCameraPrivacy = smartCameraPrivacyRules

export const primarySmartCameraModes = Object.freeze([
  { icon: '🧠', id: 'forgotten', label: 'Har jag glömt något?', needs: ['memory'], usesCamera: true },
  { icon: '👤', id: 'check-me', label: 'Kolla mig', needs: [], usesCamera: true },
  { icon: '👕', id: 'outfit', label: 'Kläder & outfit', needs: [], usesCamera: true },
  { icon: '💇', id: 'grooming', label: 'Hår & grooming', needs: [], usesCamera: true },
  { icon: '🎒', id: 'items', label: 'Vad har jag med mig?', needs: ['memory'], usesCamera: true },
  { icon: '🪥', id: 'get-ready', label: 'Göra mig klar', needs: ['memory'], usesCamera: false },
  { existing: 'food', icon: '🍽', id: 'food', label: 'Mat', needs: [], usesCamera: false },
  { existing: 'body', icon: '🧍', id: 'body', label: 'Kroppsscanning', needs: [], usesCamera: false },
  { icon: '🎙', id: 'ask-ai', label: 'Fråga AI', needs: [], usesCamera: false },
])

export const secondarySmartCameraModes = Object.freeze([
  { icon: '✅', id: 'last-check', label: 'Sista kollen', needs: ['memory'], usesCamera: true },
  { icon: '📌', id: 'where', label: 'Var lade jag den?', needs: ['memory'], usesCamera: false },
  { icon: '🧳', id: 'pack', label: 'Packning', needs: ['memory'], usesCamera: true },
  { icon: '🧩', id: 'recall', label: 'Minnesträning', needs: ['memory'], usesCamera: false },
  { icon: '🔁', id: 'routines', label: 'Rutiner', needs: ['memory'], usesCamera: false },
  { icon: '👁', id: 'eyes', label: 'Ögon', needs: ['eyes'], usesCamera: true },
  { icon: '👄', id: 'mouth', label: 'Mun', needs: ['mouth'], usesCamera: true },
])

export function getSmartCameraHubModes(flags) {
  const visible = (mode) => mode.needs.every((need) => isFeatureEnabled(need, flags))
  return {
    primary: primarySmartCameraModes.filter(visible),
    secondary: secondarySmartCameraModes.filter(visible),
  }
}

export function getSmartCameraMode(id, flags) {
  const { primary, secondary } = getSmartCameraHubModes(flags)
  return [...primary, ...secondary].find((mode) => mode.id === id) || null
}

export function getExistingCameraEntryPoints() {
  return {
    bodyPhoto: 'BodyAnalysisUploader',
    bodyVideo: 'BodyAnalysisVideoScanner',
    food: 'NutritionScannerV2',
  }
}

export const futureSmartCameraModes = Object.freeze([
  'body-scan',
  'outfit-style',
  'hair-appearance',
  'front-side-back-check',
  'weather-outfit',
  'food',
])
