const openCameraStreams = new Set()
let cameraEpoch = 0
let hideReleaseBound = false

function stopTracks(stream) {
  stream?.getTracks?.().forEach((track) => {
    try {
      track.stop()
    } catch {
      // The track can already be ended.
    }
  })
}

export function currentCameraEpoch() {
  return cameraEpoch
}

export function releaseVideoElement(video) {
  if (!video) return false
  try {
    if (video.paused === false) video.pause?.()
  } catch {
    // A detached element can refuse pause.
  }
  try {
    video.srcObject = null
  } catch {
    // Clearing a detached element is still a successful release.
  }
  return true
}

export function releaseAllCameraStreams() {
  cameraEpoch += 1
  const streams = [...openCameraStreams]
  openCameraStreams.clear()
  streams.forEach(stopTracks)
}

function bindHideRelease() {
  if (hideReleaseBound || typeof window === 'undefined' || typeof document === 'undefined') return
  hideReleaseBound = true
  const release = () => releaseAllCameraStreams()
  window.addEventListener('pagehide', release)
  window.addEventListener('freeze', release)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') release()
  })
}

export function retainCameraStream(stream, epoch = cameraEpoch) {
  if (!stream) return null
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  if (epoch !== cameraEpoch || hidden) {
    stopTracks(stream)
    return null
  }
  bindHideRelease()
  for (const existing of openCameraStreams) {
    if (existing !== stream) stopTracks(existing)
  }
  openCameraStreams.clear()
  openCameraStreams.add(stream)
  return stream
}

export function releaseCameraStream(stream) {
  if (!stream) return
  openCameraStreams.delete(stream)
  stopTracks(stream)
}
