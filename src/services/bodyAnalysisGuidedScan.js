export const bodyAnalysisViews = [
  {
    doneLabel: 'Fram klar',
    key: 'front',
    label: 'Framifrån',
    shortLabel: 'Fram',
    poseTips: [
      'Stå rakt fram mot kameran.',
      'Håll armarna lätt från kroppen.',
      'Se till att hela kroppen syns från huvud till fötter.',
    ],
  },
  {
    doneLabel: 'Sida klar',
    key: 'side',
    label: 'Från sidan',
    shortLabel: 'Sida',
    poseTips: [
      'Vänd höger sida mot kameran.',
      'Stå naturligt med rak hållning.',
      'Se till att hela kroppen syns från huvud till fötter.',
    ],
  },
  {
    doneLabel: 'Bak klar',
    key: 'back',
    label: 'Bakifrån',
    shortLabel: 'Bak',
    poseTips: [
      'Vänd ryggen mot kameran.',
      'Stå rakt och avslappnat.',
      'Håll armarna lätt från kroppen.',
    ],
  },
]

export function getBodyAnalysisView(key) {
  return bodyAnalysisViews.find((view) => view.key === key) || bodyAnalysisViews[0]
}

export function getNextBodyAnalysisViewKey(currentKey, photos = {}) {
  const currentIndex = bodyAnalysisViews.findIndex((view) => view.key === currentKey)
  const nextMissingView = bodyAnalysisViews
    .slice(Math.max(0, currentIndex + 1))
    .find((view) => !photos[view.key])
    || bodyAnalysisViews.find((view) => !photos[view.key])

  return nextMissingView?.key || currentKey
}

export function getCompletedBodyAnalysisViews(photos = {}) {
  return bodyAnalysisViews.filter((view) => Boolean(photos[view.key]))
}

export function canCompleteBodyAnalysisScan(photos = {}) {
  return bodyAnalysisViews.every((view) => Boolean(photos[view.key]))
}

export function getBodyScanProgress(photos = {}) {
  const completed = getCompletedBodyAnalysisViews(photos).length
  return {
    completed,
    label: `${completed}/3`,
    total: bodyAnalysisViews.length,
  }
}

export function getBodyScanStepState(viewKey, activeViewKey, photos = {}) {
  if (viewKey === activeViewKey) return 'active'
  if (photos[viewKey]) return 'done'
  return 'waiting'
}

export const defaultBodyScanFacingMode = 'environment'
export const bodyScanCameraNavOffsetPx = 96

export function getNextBodyScanFacingMode(current = defaultBodyScanFacingMode) {
  return current === 'user' ? 'environment' : 'user'
}

export function getBodyScanFacingLabel(mode = defaultBodyScanFacingMode) {
  return mode === 'user' ? 'Främre kamera' : 'Bakre kamera'
}

export function getBodyScanVideoConstraints(facingMode = defaultBodyScanFacingMode) {
  return {
    audio: false,
    video: { facingMode: { ideal: facingMode } },
  }
}

export function getBodyScanCameraScrollY(documentTop) {
  return Math.max(0, Number(documentTop) - 8)
}

export function scrollBodyScanCameraIntoView(element, options = {}) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return 0

  const behavior = options.behavior || 'smooth'
  const navOffset = options.navOffset ?? bodyScanCameraNavOffsetPx
  const scrollY = options.scrollY ?? (typeof window !== 'undefined' ? window.scrollY : 0)
  const top = getBodyScanCameraScrollY(scrollY + element.getBoundingClientRect().top)
  const scrollTo = options.scrollTo || ((nextTop) => {
    window.scrollTo({ behavior, top: nextTop })
    element.scrollIntoView({ behavior, block: 'start', inline: 'nearest' })
  })

  scrollTo(top, navOffset)
  return top
}

export function selectBodyScanAngle(photos = {}, viewKey, { retake = false } = {}) {
  const nextPhotos = retake ? { ...photos, [viewKey]: null } : { ...photos }
  if (retake) {
    delete nextPhotos[viewKey]
  }

  return {
    activeViewKey: viewKey,
    canAnalyze: canCompleteBodyAnalysisScan(nextPhotos),
    photos: nextPhotos,
    progress: getBodyScanProgress(nextPhotos),
  }
}

export function recordBodyScanPhoto(photos = {}, viewKey, photo) {
  const nextPhotos = { ...photos, [viewKey]: photo }

  return {
    activeViewKey: getNextBodyAnalysisViewKey(viewKey, nextPhotos),
    canAnalyze: canCompleteBodyAnalysisScan(nextPhotos),
    photos: nextPhotos,
    progress: getBodyScanProgress(nextPhotos),
  }
}

export function revokeBodyScanPreview(photo) {
  const preview = photo?.preview
  if (typeof preview === 'string' && preview.startsWith('blob:')) {
    URL.revokeObjectURL(preview)
  }
}

export function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    track.stop()
  })
}

export function getCameraPermissionMessage(error, globalObject = globalThis) {
  const name = error?.name || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Kamerabehörighet nekades. Tillåt kamera eller välj bild från mobilen.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Ingen bakre kamera hittades. Välj bild från mobilen i stället.'
  }
  const win = globalObject.window || globalObject
  const host = String(win.location?.hostname || '')
  const insecureLan = win.isSecureContext === false && host && host !== 'localhost' && host !== '127.0.0.1'
  if (insecureLan || name === 'SecurityError' || name === 'NotSupportedError') {
    return `Livekamera på iPhone kräver HTTPS. Öppna https://${host || 'din-adress'} och tillåt certifikatet första gången. Välj bild är bara backup.`
  }
  return 'Kameran kunde inte starta. Kontrollera behörighet eller välj bild från mobilen.'
}

export function getLightQualityFromLuminance(luminance) {
  if (!Number.isFinite(luminance)) {
    return {
      level: 'unknown',
      status: 'neutral',
      text: 'Ljuset kunde inte mätas. Du kan fortsätta om bilden ser tydlig ut.',
    }
  }

  if (luminance < 55) {
    return {
      level: 'dark',
      status: 'warning',
      text: '⚠ För mörkt - försök stå närmare ett fönster eller en ljuskälla.',
    }
  }

  if (luminance > 220) {
    return {
      level: 'backlight',
      status: 'warning',
      text: '⚠ Väldigt starkt motljus. Vrid dig eller flytta kameran om möjligt.',
    }
  }

  return {
    level: 'good',
    status: 'positive',
    text: '✓ Bra ljus',
  }
}

export function estimateLightQualityFromImageData(imageData) {
  const data = imageData?.data

  if (!data?.length) {
    return getLightQualityFromLuminance(null)
  }

  let total = 0
  const pixels = Math.floor(data.length / 4)

  for (let index = 0; index < data.length; index += 4) {
    total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
  }

  return getLightQualityFromLuminance(total / pixels)
}

export function getAngleMatchedComparison(currentAnalysis, history = []) {
  const previousAnalysis = history.find(
    (analysis) => analysis.createdAt !== currentAnalysis?.createdAt,
  )

  if (!currentAnalysis || !previousAnalysis) {
    return []
  }

  return bodyAnalysisViews
    .map((view) => ({
      after: currentAnalysis[`${view.key}Photo`] || null,
      before: previousAnalysis[`${view.key}Photo`] || null,
      label: view.label,
      view: view.key,
    }))
    .filter((item) => item.before?.preview && item.after?.preview)
}
