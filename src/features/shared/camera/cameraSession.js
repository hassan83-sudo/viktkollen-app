import {
  currentCameraEpoch,
  releaseCameraStream,
  releaseVideoElement,
  retainCameraStream,
} from './cameraLifecycle.js'
import {
  defaultBodyScanFacingMode,
  getBodyScanFacingLabel,
  getBodyScanVideoConstraints,
  getCameraPermissionMessage,
  getNextBodyScanFacingMode,
  stopMediaStream,
} from '../../../services/bodyAnalysisGuidedScan.js'
import {
  canUseHardwareZoom,
  clampVideoScanZoom,
  drawVideoFrameToCanvas,
  getTrackZoomCapabilities,
} from '../../../services/bodyAnalysisVideoScan.js'

export const cameraSessionModes = Object.freeze([
  'check',
  'items',
  'outfit',
  'appearance',
  'grooming',
  'body',
  'food',
  'eyes',
  'mouth',
])

export const defaultCameraFacingMode = 'user'

export function isCameraSessionMode(mode) {
  return cameraSessionModes.includes(mode)
}

export async function startCameraStream(facingMode = defaultCameraFacingMode) {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    const error = new Error('Kameran är inte tillgänglig i den här miljön.')
    error.name = 'NotFoundError'
    throw error
  }

  return navigator.mediaDevices.getUserMedia(getBodyScanVideoConstraints(facingMode))
}

export async function attachStreamToVideo(video, stream) {
  if (!video || !stream) return false
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  video.muted = true
  video.autoplay = true
  video.srcObject = stream
  // Never block camera-start UI on play() resolving. Autoplay from a
  // useEffect (Smart Camera autoStart) can leave the promise pending
  // without user activation, which previously made LiveView look off
  // even after the stream was attached.
  if (typeof video.play === 'function') {
    try {
      const playResult = video.play()
      if (playResult && typeof playResult.catch === 'function') playResult.catch(() => {})
    } catch {
      // Autoplay rejection is fine; the stream is already on the element.
    }
  }
  return true
}

export function captureVideoFrame(video, canvas) {
  const target = canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null)
  if (!target) return null
  const ok = drawVideoFrameToCanvas(video, target)
  return ok ? target : null
}

export function detachStreamFromVideo(video) {
  return releaseVideoElement(video)
}

export function createCameraSession(options = {}) {
  let facingMode = options.facingMode || defaultCameraFacingMode
  let generation = 0
  let stream = null
  let videoElement = null
  let zoom = 1

  function releaseStream() {
    stopMediaStream(stream)
    stream = null
    detachStreamFromVideo(videoElement)
  }

  function abandonedResult() {
    return { abandoned: true, message: '', ok: false, stream: null }
  }

  return {
    getFacingLabel: () => getBodyScanFacingLabel(facingMode),
    getFacingMode: () => facingMode,
    getStream: () => stream,
    getZoom: () => zoom,
    isActive: () => Boolean(stream?.getTracks?.().some((track) => track.readyState !== 'ended') ?? stream),

    async start(videoEl) {
      const generationId = ++generation
      const epoch = currentCameraEpoch()
      releaseStream()
      if (videoEl) videoElement = videoEl
      try {
        const opened = await startCameraStream(facingMode)
        if (generationId !== generation) {
          releaseCameraStream(opened)
          return abandonedResult()
        }
        const retained = retainCameraStream(opened, epoch)
        if (!retained || generationId !== generation) {
          releaseCameraStream(opened)
          return abandonedResult()
        }
        stream = retained
        const target = videoEl || videoElement
        if (target) {
          videoElement = target
          await attachStreamToVideo(target, stream)
        }
        if (generationId !== generation) {
          releaseStream()
          return abandonedResult()
        }
        return { message: '', ok: true, stream }
      } catch (error) {
        if (generationId === generation) releaseStream()
        return {
          error,
          message: getCameraPermissionMessage(error),
          ok: false,
          stream: null,
        }
      }
    },

    stop() {
      generation += 1
      releaseStream()
      videoElement = null
    },

    async flip(videoEl) {
      facingMode = getNextBodyScanFacingMode(facingMode)
      return this.start(videoEl)
    },

    async setZoom(value) {
      zoom = clampVideoScanZoom(value)
      const track = stream?.getVideoTracks?.()[0]
      if (canUseHardwareZoom(track)) {
        const caps = getTrackZoomCapabilities(track)
        const applied = Math.min(caps.max, Math.max(caps.min, zoom))
        try {
          await track.applyConstraints({ advanced: [{ zoom: applied }] })
        } catch {
          return zoom
        }
      }
      return zoom
    },

    captureFrame(video, canvas) {
      return captureVideoFrame(video, canvas)
    },
  }
}

export {
  defaultBodyScanFacingMode,
  getBodyScanFacingLabel,
  getBodyScanVideoConstraints,
  getCameraPermissionMessage,
  getNextBodyScanFacingMode,
  stopMediaStream,
}
