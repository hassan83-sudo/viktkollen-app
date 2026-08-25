import { useEffect, useRef, useState } from 'react'
import { createCameraSession, detachStreamFromVideo } from '../../shared/camera/cameraSession.js'

export default function SmartCameraLiveView({ enabled, onActiveChange }) {
  const videoRef = useRef(null)
  const sessionRef = useRef(null)
  const onActiveChangeRef = useRef(onActiveChange)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')
  const [facingLabel, setFacingLabel] = useState('')
  const [active, setActive] = useState(false)

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange
  }, [onActiveChange])

  useEffect(() => {
    if (!enabled || !requested) return undefined

    const session = createCameraSession({ facingMode: 'user' })
    const videoEl = videoRef.current
    sessionRef.current = session
    let cancelled = false

    session.start(videoEl).then((result) => {
      if (cancelled) {
        session.stop()
        return
      }
      setError(result.ok ? '' : result.message)
      setActive(result.ok)
      setFacingLabel(session.getFacingLabel())
      onActiveChangeRef.current?.(result.ok)
    })

    return () => {
      cancelled = true
      session.stop()
      detachStreamFromVideo(videoEl)
      sessionRef.current = null
      onActiveChangeRef.current?.(false)
    }
  }, [enabled, requested])

  async function flip() {
    const session = sessionRef.current
    if (!session) return
    const result = await session.flip(videoRef.current)
    setError(result.ok ? '' : result.message)
    setActive(result.ok)
    setFacingLabel(session.getFacingLabel())
    onActiveChangeRef.current?.(result.ok)
  }

  function stop() {
    sessionRef.current?.stop()
    sessionRef.current = null
    detachStreamFromVideo(videoRef.current)
    setActive(false)
    setRequested(false)
    onActiveChangeRef.current?.(false)
  }

  if (!enabled) return null

  if (!requested) {
    return (
      <section className="smart-camera-live is-off" aria-label="Kameran är avstängd">
        <p className="smart-camera-note">
          Kameran är avstängd. Den startar först när du trycker Starta kamera.
          Bilden stannar lokalt och skickas inte någonstans.
        </p>
        <button className="primary-button" type="button" onClick={() => setRequested(true)}>
          Starta kamera
        </button>
      </section>
    )
  }

  return (
    <section className="smart-camera-live" aria-label="Lokal kameravy">
      <div className="smart-camera-live-frame">
        <video ref={videoRef} playsInline muted autoPlay />
        {active && <span className="smart-camera-live-dot">● Kamera aktiv · lokal preview</span>}
      </div>
      {error && <p className="smart-camera-note">{error}</p>}
      <div className="smart-camera-live-actions">
        <small>{facingLabel || 'Kamera'}</small>
        <button className="secondary-button" type="button" onClick={flip}>Byt kamera</button>
        <button className="secondary-button" type="button" onClick={stop}>Stäng kamera</button>
      </div>
    </section>
  )
}
