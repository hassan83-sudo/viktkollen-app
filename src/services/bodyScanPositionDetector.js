/**
 * Honest automatic body-position support.
 * Viktkollen does not ship a pose model. Auto only runs when the browser
 * exposes a real PoseDetector (or equivalent) API. FaceDetector is not
 * treated as full-body framing.
 */

export function getAutomaticBodyPositionSupport(globalObject = globalThis) {
  const PoseDetector = globalObject.PoseDetector
  if (typeof PoseDetector === 'function') {
    return {
      available: true,
      api: 'PoseDetector',
      label: 'Automatisk ramigenkänning använder enhetens pose-API.',
    }
  }

  const BodyDetector = globalObject.BodyDetector
  if (typeof BodyDetector === 'function') {
    return {
      available: true,
      api: 'BodyDetector',
      label: 'Automatisk ramigenkänning använder enhetens kropps-API.',
    }
  }

  return {
    available: false,
    api: null,
    label: 'Automatisk positionering är inte tillgänglig på den här enheten.',
  }
}

export function getDefaultFramingMode(globalObject = globalThis) {
  return getAutomaticBodyPositionSupport(globalObject).available ? 'auto' : 'manual'
}

export function evaluateBodyPosition(landmarks, frame = { width: 1, height: 1 }) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    return {
      valid: false,
      code: 'searching',
      message: 'Söker person...',
      voice: 'Ställ dig rakt fram mot kameran.',
    }
  }

  const xs = landmarks.map((point) => Number(point.x)).filter(Number.isFinite)
  const ys = landmarks.map((point) => Number(point.y)).filter(Number.isFinite)
  if (!xs.length || !ys.length) {
    return {
      valid: false,
      code: 'searching',
      message: 'Söker person...',
      voice: 'Ställ dig rakt fram mot kameran.',
    }
  }

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY
  const centerX = (minX + maxX) / 2
  const frameWidth = Math.max(1, Number(frame.width) || 1)
  const frameHeight = Math.max(1, Number(frame.height) || 1)

  if (height < frameHeight * 0.55) {
    return {
      valid: false,
      code: 'too-far',
      message: 'Hela kroppen måste synas. Flytta dig lite närmare.',
      voice: 'Flytta dig lite närmare.',
    }
  }

  if (height > frameHeight * 0.96 || minY < frameHeight * 0.02 || maxY > frameHeight * 0.98) {
    return {
      valid: false,
      code: 'too-close',
      message: 'Hela kroppen måste synas. Flytta dig lite bakåt.',
      voice: 'Flytta dig lite bakåt.',
    }
  }

  if (centerX < frameWidth * 0.38) {
    return {
      valid: false,
      code: 'too-left',
      message: 'Flytta dig lite åt höger.',
      voice: 'Flytta dig lite åt höger.',
    }
  }

  if (centerX > frameWidth * 0.62) {
    return {
      valid: false,
      code: 'too-right',
      message: 'Flytta dig lite åt vänster.',
      voice: 'Flytta dig lite åt vänster.',
    }
  }

  if (width < frameWidth * 0.12) {
    return {
      valid: false,
      code: 'too-narrow',
      message: 'Hela kroppen måste synas.',
      voice: 'Hela kroppen måste synas.',
    }
  }

  return {
    valid: true,
    code: 'valid',
    message: 'Bra position — håll still',
    voice: 'Bra position. Håll still.',
  }
}

export async function detectBodyPosition(video, globalObject = globalThis) {
  const support = getAutomaticBodyPositionSupport(globalObject)
  if (!support.available || !video) {
    return {
      ...evaluateBodyPosition([]),
      available: false,
      support,
    }
  }

  try {
    const Detector = globalObject[support.api]
    const detector = new Detector()
    const poses = await detector.detect(video)
    const first = Array.isArray(poses) ? poses[0] : poses
    const landmarks = first?.keypoints || first?.landmarks || first?.pose || []
    return {
      ...evaluateBodyPosition(landmarks, {
        width: video.videoWidth || video.clientWidth,
        height: video.videoHeight || video.clientHeight,
      }),
      available: true,
      support,
    }
  } catch {
    return {
      valid: false,
      code: 'unavailable',
      message: support.label,
      voice: '',
      available: false,
      support,
    }
  }
}
