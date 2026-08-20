export function getNutritionAnalysisBlocker({
  imagePayload,
  isAnalyzing,
  isOnline,
  providerType = 'local',
  remoteConsent,
} = {}) {
  if (!imagePayload) {
    return 'Välj eller ta en bild innan analysen startas.'
  }

  if (isAnalyzing) {
    return 'En analys körs redan. Vänta tills den är klar eller avbryt först.'
  }

  if (providerType === 'remote' && !remoteConsent) {
    return 'Bekräfta först att bilden får skickas till tillfällig AI-analys.'
  }

  if (providerType === 'remote' && !isOnline) {
    return 'Du är offline. Remote analys är inte tillgänglig just nu.'
  }

  return ''
}

export function createAnalysisController() {
  if (typeof AbortController === 'undefined') {
    return {
      abort: () => {},
      signal: { aborted: false },
    }
  }

  return new AbortController()
}
