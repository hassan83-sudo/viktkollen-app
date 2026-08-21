export function hasUsableNutritionImageBlob(blob) {
  if (!blob) return false
  return !Number.isFinite(blob.size) || blob.size > 0
}

export function getNutritionImagePayloadSnapshot(payload = null, fallbackRef = null) {
  const source = hasUsableNutritionImageBlob(fallbackRef?.processedBlob)
    ? fallbackRef
    : hasUsableNutritionImageBlob(payload?.processedBlob)
      ? payload
      : null

  return source
    ? {
      imageMetadata: source.imageMetadata || source.metadata || null,
      processedBlob: source.processedBlob,
      previewUrl: source.previewUrl || '',
    }
    : null
}

export function shouldIgnoreEmptyNutritionImageSelection(file, currentPayload = null) {
  return !file && Boolean(getNutritionImagePayloadSnapshot(currentPayload))
}

export function getNutritionAnalysisBlocker({
  imagePayload,
  isAnalyzing,
  isOnline,
  providerType = 'local',
  remoteConsent,
} = {}) {
  if (!hasUsableNutritionImageBlob(imagePayload?.processedBlob)) {
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
