import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../services/supabaseClient.js'
import '../SocialWatch.css'

const ADMIN_USER_ID = 'd449f4d1-d2c7-41fd-8c74-e8b1bbe46f89'

function parseVideo(urlValue) {
  const raw = String(urlValue || '').trim()
  if (!raw) return null

  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase()

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    let id = ''
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || ''
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || ''
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] || ''
    else id = url.searchParams.get('v') || ''

    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null
    return {
      platform: 'youtube',
      id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      label: 'YouTube',
    }
  }

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const match = url.pathname.match(/\/video\/(\d+)/)
    if (!match?.[1]) return null
    return {
      platform: 'tiktok',
      embedUrl: `https://www.tiktok.com/player/v1/${match[1]}`,
      label: 'TikTok',
    }
  }

  return null
}

function SocialWatch() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [playingVideoId, setPlayingVideoId] = useState(null)

  const isAdmin = userId === ADMIN_USER_ID

  async function loadVideos() {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('social_room_videos')
      .select('id, platform, source_url, title, created_at, enabled')
      .order('created_at', { ascending: false })

    if (loadError) {
      setError('Kunde inte hämta videorna.')
      setVideos([])
    } else {
      setVideos(data || [])
      setError('')
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data?.user?.id || '')
    })
    loadVideos()
    return () => {
      cancelled = true
    }
  }, [])

  const preparedVideos = useMemo(() => videos.map((video) => ({
    ...video,
    parsed: parseVideo(video.source_url),
  })).filter((video) => video.parsed), [videos])

  async function addVideo(event) {
    event.preventDefault()
    if (!isAdmin || saving) return

    const parsed = parseVideo(url)
    if (!parsed) {
      setError('Klistra in en giltig YouTube- eller TikTok-videolänk.')
      return
    }

    setSaving(true)
    const { error: insertError } = await supabase.from('social_room_videos').insert({
      platform: parsed.platform,
      source_url: url.trim(),
      title: title.trim().slice(0, 100),
      created_by: userId,
      enabled: true,
    })
    setSaving(false)

    if (insertError) {
      setError('Kunde inte lägga till videon.')
      return
    }

    setUrl('')
    setTitle('')
    await loadVideos()
  }

  async function removeVideo(id) {
    if (!isAdmin) return
    const { error: deleteError } = await supabase.from('social_room_videos').delete().eq('id', id)
    if (deleteError) {
      setError('Kunde inte ta bort videon.')
      return
    }
    if (playingVideoId === id) setPlayingVideoId(null)
    await loadVideos()
  }

  return (
    <article className="social-room-card is-wide social-watch-card">
      <h2>Titta tillsammans</h2>
      <p>Här visas videor som lagts in av Viktkollen-administratören.</p>

      {isAdmin ? (
        <form className="social-watch-admin" onSubmit={addVideo}>
          <strong>Lägg till video</strong>
          <label>
            YouTube- eller TikTok-länk
            <input
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </label>
          <label>
            Rubrik (valfritt)
            <input
              type="text"
              maxLength={100}
              placeholder="T.ex. Kvällens video"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Lägger till…' : 'Lägg till video'}
          </button>
          <small>Den här kontrollen visas bara för ditt adminkonto.</small>
        </form>
      ) : null}

      {error ? <p className="overview-social-empty" role="alert">{error}</p> : null}
      {loading ? <p>Hämtar videor…</p> : null}
      {!loading && preparedVideos.length === 0 ? <p>Inget innehåll är anslutet ännu.</p> : null}

      <div className="social-watch-list">
        {preparedVideos.map((video) => (
          <section className="social-watch-item" key={video.id}>
            <div className="social-watch-item-head">
              <div>
                <strong>{video.title || video.parsed.label}</strong>
                <small>{video.parsed.label}</small>
              </div>
              {isAdmin ? (
                <button className="secondary-button" type="button" onClick={() => removeVideo(video.id)}>
                  Ta bort
                </button>
              ) : null}
            </div>

            {video.platform === 'youtube' && playingVideoId !== video.id ? (
              <button
                className="social-watch-youtube-preview"
                type="button"
                onClick={() => setPlayingVideoId(video.id)}
                aria-label={`Spela ${video.title || 'YouTube-video'} här`}
              >
                <img src={video.parsed.thumbnailUrl} alt="" loading="lazy" />
                <span className="social-watch-play" aria-hidden="true">▶</span>
              </button>
            ) : (
              <div className={`social-watch-frame is-${video.platform}`}>
                <iframe
                  title={video.title || `${video.parsed.label}-video`}
                  src={video.platform === 'youtube' ? `${video.parsed.embedUrl}?autoplay=1&playsinline=1&rel=0` : video.parsed.embedUrl}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}

export default SocialWatch
