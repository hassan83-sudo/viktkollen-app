export const privacyLayerIds = Object.freeze(['cameraSees', 'aiReceives', 'saved'])

function getAiReceivesItems(aiReceivesFrame, voiceToAi, audioToServer) {
  if (audioToServer) {
    return ['Ljudet du väljer att analysera skickas till Viktkollens server först när du trycker på analysera-knappen. Fågel- och ljudanalysen sker i vår egen tjänst; musik, melodi och texttolkning skickas vidare till en extern tjänst som anges innan du skickar. Ingen kamerabild följer med.']
  }

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
  audioToServer = false,
  cameraActive = false,
  savedLabels = [],
  voiceToAi = false,
} = {}) {
  return {
    aiReceives: {
      id: 'aiReceives',
      items: getAiReceivesItems(aiReceivesFrame, voiceToAi, audioToServer),
      localOnly: !aiReceivesFrame && !voiceToAi && !audioToServer,
      title: 'Vad AI får',
    },
    cameraSees: {
      id: 'cameraSees',
      items: audioToServer
        ? ['Kameran används inte i det här läget.']
        : cameraActive
          ? ['Live-preview visas bara på den här enheten.']
          : ['Kameran är inte igång.'],
      localOnly: true,
      title: 'Vad kameran ser',
    },
    saved: {
      id: 'saved',
      items: audioToServer
        ? ['Ljudet sparas inte, varken på enheten eller på servern. Resultatet visas bara här.']
        : savedLabels.length
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
