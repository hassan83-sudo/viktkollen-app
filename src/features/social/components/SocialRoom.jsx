import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isSupabaseConfigured, supabase } from '../../../services/supabaseClient.js'
import { loadSocialSnapshot } from '../hooks/loadSocialSnapshot.js'
import { canLoadSocialRoomData } from '../model/socialRoomPolicy.js'
import { createSocialApi } from '../services/socialApi.js'

const roomTabs = ['room', 'chat', 'watch', 'board', 'games']
const ambientTracks = ['rain', 'ocean', 'piano', 'spa']
const timerOptions = [5, 15, 30]
const hasApprovedAmbientAudio = false

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined

    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(query.matches)
    update()
    query.addEventListener?.('change', update)

    return () => query.removeEventListener?.('change', update)
  }, [])

  return prefersReducedMotion
}

function SocialRoom({
  enabled = false,
  isAuthenticated = false,
  liveEnabled = false,
  mediaActive = false,
}) {
  const { t } = useTranslation('social')
  const [activeTab, setActiveTab] = useState('room')
  const [snapshot, setSnapshot] = useState({ conversations: [], friends: [] })
  const [loadError, setLoadError] = useState('')
  const [restMode, setRestMode] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState('rain')
  const [timerMinutes, setTimerMinutes] = useState(15)
  const [volume, setVolume] = useState(45)
  const [isPlaying, setIsPlaying] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const canLoadLiveData = canLoadSocialRoomData({
    enabled,
    isAuthenticated,
    liveEnabled,
    supabaseConfigured: isSupabaseConfigured(),
  })

  useEffect(() => {
    if (!canLoadLiveData) return undefined

    let cancelled = false
    loadSocialSnapshot(createSocialApi({ client: supabase }))
      .then((nextSnapshot) => {
        if (cancelled) return
        setSnapshot(nextSnapshot)
        setLoadError('')
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error?.message || t('loadFriendsError'))
      })

    return () => {
      cancelled = true
    }
  }, [canLoadLiveData, t])

  useEffect(() => {
    const interruptAmbientAudio = (event) => {
      if (event.detail?.active) setIsPlaying(false)
    }
    window.addEventListener('viktkollen:ambient-audio-interruption', interruptAmbientAudio)
    return () => window.removeEventListener('viktkollen:ambient-audio-interruption', interruptAmbientAudio)
  }, [])

  const liveSnapshot = canLoadLiveData ? snapshot : { conversations: [], friends: [] }
  const onlineFriends = useMemo(
    () => (Array.isArray(liveSnapshot.friends) ? liveSnapshot.friends : []).filter((friend) => friend?.online === true),
    [liveSnapshot.friends],
  )
  const playbackActive = isPlaying && !mediaActive && !prefersReducedMotion

  if (!enabled) return null

  const liveStatus = !canLoadLiveData
    ? t('room.chat.disconnected')
    : loadError || t('room.chat.ready')

  return (
    <section className="social-room" aria-labelledby="social-room-title">
      <header className="social-room-header">
        <p className="social-room-eyebrow">{t('room.eyebrow')}</p>
        <h1 id="social-room-title">{t('room.title')}</h1>
        <p>{t('room.intro')}</p>
      </header>

      <div className="social-room-tablist" role="tablist" aria-label={t('room.tabsAria')}>
        {roomTabs.map((tab) => (
          <button
            aria-controls={`social-room-panel-${tab}`}
            aria-selected={activeTab === tab}
            id={`social-room-tab-${tab}`}
            key={tab}
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {t(`room.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`social-room-tab-${activeTab}`}
        className="social-room-grid"
        id={`social-room-panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === 'room' && (
          <>
            <article className="social-room-card is-wide">
              <h2>{t('room.welcome.title')}</h2>
              <p>{t('room.welcome.body')}</p>
              <button className="social-room-shortcut" type="button" onClick={() => setActiveTab('chat')}>
                {t('room.welcome.chatShortcut')}
              </button>
            </article>
            <article className="social-room-card">
              <h3>{t('room.friends.title')}</h3>
              <p>
                {onlineFriends.length
                  ? t('room.friends.online', { count: onlineFriends.length })
                  : t('room.friends.empty')}
              </p>
            </article>
            <article className="social-room-card">
              <h3>{t('room.clips.title')}</h3>
              <p>{t('room.clips.body')}</p>
            </article>
            <article className="social-room-card">
              <h3>{t('room.tip.title')}</h3>
              <p>{t('room.tip.body')}</p>
            </article>
            <article className="social-room-card">
              <h3>{t('room.board.title')}</h3>
              <p>{t('room.board.preview')}</p>
            </article>
            <article className="social-room-card is-wide">
              <h3>{t('room.restMode.title')}</h3>
              <p>{t('room.restMode.body')}</p>
              <button
                aria-pressed={restMode}
                className="social-room-rest-mode"
                type="button"
                onClick={() => setRestMode((current) => !current)}
              >
                {restMode ? t('room.restMode.on') : t('room.restMode.off')}
              </button>
            </article>
          </>
        )}

        {activeTab === 'chat' && (
          <article className="social-room-chat-surface is-wide">
            <h2>{t('room.chat.title')}</h2>
            <p className="social-room-status" role="status">{liveStatus}</p>
            {canLoadLiveData && !loadError && liveSnapshot.conversations.length === 0 ? (
              <p>{t('room.chat.empty')}</p>
            ) : null}
            <p>{t('room.chat.surface')}</p>
            <div className="social-room-chat-actions" aria-label={t('room.chat.actionsAria')}>
              <button disabled={!canLoadLiveData} type="button">{t('room.chat.private')}</button>
              <button disabled={!canLoadLiveData} type="button">{t('room.chat.group')}</button>
            </div>
            <small>{t('room.chat.safety')}</small>
          </article>
        )}

        {activeTab === 'watch' && (
          <article className="social-room-card is-wide">
            <h2>{t('room.watch.title')}</h2>
            <p>{t('room.watch.body')}</p>
            <small>{t('room.watch.safety')}</small>
          </article>
        )}

        {activeTab === 'board' && (
          <article className="social-room-card is-wide">
            <p className="social-room-eyebrow">{t('room.board.fromViktkollen')}</p>
            <h2>{t('room.board.title')}</h2>
            <p>{t('room.board.body')}</p>
          </article>
        )}

        {activeTab === 'games' && (
          <article className="social-room-card is-wide">
            <h2>{t('room.games.title')}</h2>
            <p>{t('room.games.body')}</p>
          </article>
        )}
      </div>

      <aside className="social-room-player" aria-label={t('room.player.aria')}>
        <h2>{t('room.player.title')}</h2>
        <p>{t('room.player.trackName', { track: t(`room.player.tracks.${selectedTrack}`) })}</p>
        {!hasApprovedAmbientAudio ? <small>{t('room.player.unavailable')}</small> : null}
        <div className="social-room-player-controls">
          <button
            aria-label={playbackActive ? t('room.player.pause') : t('room.player.play')}
            aria-pressed={playbackActive}
            disabled={!hasApprovedAmbientAudio || mediaActive}
            type="button"
            onClick={() => setIsPlaying((current) => !current)}
          >
            {playbackActive ? 'II' : '▶'}
          </button>
          <label>
            {t('room.player.volume')}
            <input
              aria-label={t('room.player.volume')}
              max="100"
              min="0"
              type="range"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="social-room-player-options" aria-label={t('room.player.tracksAria')}>
          {ambientTracks.map((track) => (
            <button
              aria-pressed={selectedTrack === track}
              key={track}
              type="button"
              onClick={() => setSelectedTrack(track)}
            >
              {t(`room.player.tracks.${track}`)}
            </button>
          ))}
        </div>
        <div className="social-room-player-timers" aria-label={t('room.player.timerAria')}>
          {timerOptions.map((minutes) => (
            <button
              aria-pressed={timerMinutes === minutes}
              key={minutes}
              type="button"
              onClick={() => setTimerMinutes(minutes)}
            >
              {t('room.player.timer', { minutes })}
            </button>
          ))}
        </div>
      </aside>
    </section>
  )
}

export default SocialRoom
