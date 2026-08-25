export const privacyLayerIds = Object.freeze(['cameraSees', 'aiReceives', 'saved'])

function getAiReceivesItems(aiReceivesFrame, voiceToAi) {
  const items = [
    aiReceivesFrame
      ? 'En stillbild skickas till AI först när du uttryckligen väljer att analysera.'
      : 'AI får ingen kamerabild i det här läget.',
  ]

  if (voiceToAi) {
    items.push('Startar du röstsamtal skickas ljudet till vår AI-leverantör för att kunna svara. Ingen kamerabild följer med.')
  }

  return items
}

export function getSmartCameraPrivacyLayers({
  aiReceivesFrame = false,
  cameraActive = false,
  savedLabels = [],
  voiceToAi = false,
} = {}) {
  return {
    aiReceives: {
      id: 'aiReceives',
      items: getAiReceivesItems(aiReceivesFrame, voiceToAi),
      localOnly: !aiReceivesFrame && !voiceToAi,
      title: 'Vad AI får',
    },
    cameraSees: {
      id: 'cameraSees',
      items: cameraActive
        ? ['Live-preview visas bara på den här enheten.']
        : ['Kameran är inte igång.'],
      localOnly: true,
      title: 'Vad kameran ser',
    },
    saved: {
      id: 'saved',
      items: savedLabels.length
        ? savedLabels
        : ['Inget från kameran sparas. Checklistor och anteckningar sparas bara om du själv skriver dem.'],
      localOnly: true,
      title: 'Vad som sparas',
    },
  }
}

export const smartCameraPrivacyRules = Object.freeze({
  analyzeMinimumFrames: true,
  explicitAiSend: true,
  faceProtectionOptional: true,
  livePreviewLocalOnly: true,
  noHiddenRecording: true,
  noImagesInLogs: true,
  persistVideoOnlyOnConsent: true,
  visibleCameraIndicator: true,
})
