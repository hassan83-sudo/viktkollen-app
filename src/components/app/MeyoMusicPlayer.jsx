import { useEffect, useRef, useState } from 'react'

const MUSIC_PATH = '/Meyo.mp3'
const STORAGE_KEY = 'viktkollen.meyo.enabled'

function readPreference() {
  try { return window.localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
}

export default function MeyoMusicPlayer() {
  const audioRef = useRef(null)
  const [enabled, setEnabled] = useState(readPreference)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onError = () => setError(true)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)
    return () => {
      audio.pause()
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    try { window.localStorage.setItem(STORAGE_KEY, String(enabled)) } catch { /* storage optional */ }
    if (!enabled) {
      audio.pause()
      audio.currentTime = 0
      return
    }
    // Safari/iOS may reject autoplay until the user interacts with the page.
    audio.play().catch(() => setPlaying(false))
  }, [enabled])

  function toggle() {
    if (!enabled) { setEnabled(true); return }
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 'calc(86px + env(safe-area-inset-bottom, 0px))', zIndex: 80 }}>
      <audio ref={audioRef} src={MUSIC_PATH} loop preload="none" />
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: 6, borderRadius: 24, background: '#202020', color: 'white', boxShadow: '0 2px 10px #0004' }}>
        <button type="button" onClick={toggle} aria-label={playing ? 'Pausa Meyo' : 'Spela Meyo'} style={{ background: 'transparent', color: 'inherit', border: 0, padding: '5px 8px', cursor: 'pointer' }}>
          {playing ? '⏸' : '▶'} Meyo
        </button>
        <button type="button" onClick={() => setEnabled(!enabled)} aria-label={enabled ? 'Stäng av bakgrundsmusik' : 'Aktivera bakgrundsmusik'} aria-pressed={enabled} style={{ border: 0, borderRadius: 16, padding: '5px 9px', background: enabled ? '#facc15' : '#555', color: enabled ? '#111' : 'white', cursor: 'pointer' }}>
          {enabled ? 'Musik på' : 'Musik av'}
        </button>
      </div>
      {error && <span role="status" style={{ fontSize: 11, background: '#202020', color: 'white' }}>Meyo.mp3 saknas</span>}
    </div>
  )
}
