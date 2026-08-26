import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import useOverviewStageLock from '../../../components/app/useOverviewStageLock.js'
import { isSupabaseConfigured, supabase } from '../../../services/supabaseClient.js'
import { loadSocialSnapshot } from '../hooks/loadSocialSnapshot.js'
import { shouldStartSocialSubscriptions } from '../model/socialPolicy.js'
import { createSocialApi } from '../services/socialApi.js'
import { subscribeConversationMessages } from '../services/socialRealtime.js'

const api = createSocialApi({ client: supabase })

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function SocialStage({
  enabled = false,
  initialConversationId = null,
  initialView = 'inbox',
  isAuthenticated = false,
  onClose,
}) {
  useOverviewStageLock(onClose)
  const [view, setView] = useState(initialView)
  const [snapshot, setSnapshot] = useState({ conversations: [], friends: [], requests: { incoming: [], outgoing: [] }, blocks: [] })
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [conversationId, setConversationId] = useState(initialConversationId)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [myProfile, setMyProfile] = useState(null)
  const [profileUsername, setProfileUsername] = useState('')
  const [profileDisplayName, setProfileDisplayName] = useState('')
  const canSubscribe = shouldStartSocialSubscriptions({
    featureEnabled: enabled,
    isAuthenticated,
    supabaseConfigured: isSupabaseConfigured(),
  })

  useEffect(() => {
    if (!enabled || !canSubscribe) return undefined
    let cancelled = false
    Promise.all([
      loadSocialSnapshot(api),
      api.getMyPublicProfile().catch(() => null),
    ]).then(([next, profile]) => {
      if (cancelled) return
      setSnapshot(next)
      setMyProfile(profile)
      setStatus('ready')
      setError('')
      if (!profile) setView((current) => (current === 'inbox' ? 'profile' : current))
    }).catch((caught) => {
      if (cancelled) return
      setError(caught?.message || 'Kunde inte hämta vänner.')
      setStatus('error')
    })
    return () => {
      cancelled = true
    }
  }, [canSubscribe, enabled])

  useEffect(() => {
    if (!conversationId || !canSubscribe) return undefined
    let cancelled = false
    api.listMessages(conversationId).then((rows) => {
      if (!cancelled) setMessages(rows)
    }).catch((caught) => {
      if (!cancelled) setError(caught?.message || 'Kunde inte hämta chatten.')
    })
    api.markRead(conversationId).catch(() => {})
    return subscribeConversationMessages({
      client: supabase,
      conversationId,
      enabled,
      isAuthenticated,
      onInsert: (row) => {
        if (!row) return
        setMessages((current) => current.some((item) => item.id === row.id) ? current : [...current, row])
      },
      supabaseConfigured: isSupabaseConfigured(),
    })
  }, [canSubscribe, conversationId, enabled, isAuthenticated])

  async function refresh() {
    if (!canSubscribe) return
    try {
      const next = await loadSocialSnapshot(api)
      setSnapshot(next)
      setStatus('ready')
      setError('')
    } catch (caught) {
      setError(caught?.message || 'Kunde inte hämta vänner.')
      setStatus('error')
    }
  }

  const activeConversation = useMemo(
    () => snapshot.conversations.find((row) => row.conversationId === conversationId) || null,
    [conversationId, snapshot.conversations],
  )

  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay || !enabled) return null

  async function onSearch(event) {
    event.preventDefault()
    try {
      setResults(await api.searchPeople(query))
    } catch (caught) {
      setError(caught?.message || 'Sökningen misslyckades.')
    }
  }

  async function sendDraft(event) {
    event.preventDefault()
    if (!conversationId) return
    const text = draft
    setDraft('')
    try {
      const sent = await api.sendText(conversationId, text)
      setMessages((current) => [...current, sent])
    } catch (caught) {
      setDraft(text)
      setError(caught?.message || 'Meddelandet kunde inte skickas.')
    }
  }

  async function openFriend(profile) {
    try {
      const id = await api.openDirectConversation(profile.userId)
      setConversationId(id)
      setView('thread')
      await refresh()
    } catch (caught) {
      setError(caught?.message || 'Kunde inte öppna chatten.')
    }
  }

  async function savePublicProfile(event) {
    event.preventDefault()
    try {
      const profile = await api.upsertPublicProfile({
        displayName: profileDisplayName,
        username: profileUsername,
      })
      setMyProfile(profile)
      setView('search')
      setError('')
    } catch (caught) {
      setError(caught?.message || 'Kunde inte spara profilen.')
    }
  }

  return createPortal(
    <div className="social-stage" role="dialog" aria-labelledby="social-stage-title" aria-modal="true">
      <div className="social-stage-bar">
        <h1 id="social-stage-title">{view === 'thread' ? (activeConversation?.other?.displayName || 'Chatt') : 'Vänner'}</h1>
        <button className="overview-body-scan-close" type="button" onClick={onClose}>Stäng</button>
      </div>
      <nav className="social-stage-tabs" aria-label="Social navigation">
        <button className={view === 'inbox' ? 'is-active' : ''} type="button" onClick={() => setView('inbox')}>Chatt</button>
        <button className={view === 'friends' ? 'is-active' : ''} type="button" onClick={() => setView('friends')}>Vänner</button>
        <button className={view === 'requests' ? 'is-active' : ''} type="button" onClick={() => setView('requests')}>Förfrågningar</button>
        <button className={view === 'search' ? 'is-active' : ''} type="button" onClick={() => setView('search')}>Sök</button>
        <button className={view === 'profile' ? 'is-active' : ''} type="button" onClick={() => setView('profile')}>Profil</button>
      </nav>
      {!isAuthenticated || !isSupabaseConfigured() ? (
        <p className="overview-social-empty">Logga in med molnkonto för att använda vänner och chatt. Ingen fejkdata visas.</p>
      ) : (
        <div className="social-stage-body">
          {error ? <p className="overview-social-empty" role="alert">{error}</p> : null}
          {status === 'loading' ? <p className="overview-social-empty">Hämtar…</p> : null}
          {view === 'profile' ? (
            <form className="social-search" onSubmit={savePublicProfile}>
              <p className="overview-social-empty">
                Skapa en publik socialprofil. E-post och telefon kopieras inte.
                {myProfile ? ` Nuvarande: @${myProfile.username}` : ''}
              </p>
              <label>
                Användarnamn
                <input
                  autoComplete="off"
                  inputMode="text"
                  maxLength={24}
                  placeholder="anna_82"
                  value={profileUsername}
                  onChange={(event) => setProfileUsername(event.target.value)}
                />
              </label>
              <label>
                Visningsnamn
                <input
                  autoComplete="nickname"
                  maxLength={48}
                  placeholder="Anna"
                  value={profileDisplayName}
                  onChange={(event) => setProfileDisplayName(event.target.value)}
                />
              </label>
              <button className="primary-button" type="submit">Spara profil</button>
            </form>
          ) : null}
          {view === 'inbox' ? (
            snapshot.conversations.length ? (
              <ul className="overview-social-list">
                {snapshot.conversations.map((row) => (
                  <li key={row.conversationId}>
                    <button
                      className="overview-social-row"
                      type="button"
                      onClick={() => {
                        setConversationId(row.conversationId)
                        setView('thread')
                      }}
                    >
                      <span className="overview-social-copy">
                        <strong>{row.other?.displayName || 'Vän'}</strong>
                        <small>{row.lastMessage || 'Ingen konversation ännu'}</small>
                      </span>
                      {row.unreadCount > 0 ? <span className="overview-social-unread">{row.unreadCount}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="overview-social-empty">Inga chattar ännu. Lägg till en vän för att börja.</p>
            )
          ) : null}
          {view === 'friends' ? (
            snapshot.friends.length ? (
              <ul className="overview-social-list">
                {snapshot.friends.map((friend) => (
                  <li className="social-friend-row" key={friend.userId}>
                    <strong>{friend.displayName}</strong>
                    <small>@{friend.username}</small>
                    <div className="overview-social-actions">
                      <button className="primary-button" type="button" onClick={() => openFriend(friend)}>Chatt</button>
                      <button className="secondary-button" type="button" onClick={async () => { await api.removeFriend(friend.userId); refresh() }}>Ta bort</button>
                      <button className="secondary-button" type="button" onClick={async () => { await api.blockUser(friend.userId); refresh() }}>Blockera</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="overview-social-empty">Träna och håll kontakten tillsammans.</p>
            )
          ) : null}
          {view === 'requests' ? (
            snapshot.requests.incoming.length || snapshot.requests.outgoing.length ? (
              <div className="social-request-stack">
                {snapshot.requests.incoming.map((request) => (
                  <article key={request.id}>
                    <strong>{request.profile?.displayName || 'Förfrågan'}</strong>
                    <div className="overview-social-actions">
                      <button className="primary-button" type="button" onClick={async () => { await api.respondToFriendRequest(request.id, 'accept'); refresh() }}>Acceptera</button>
                      <button className="secondary-button" type="button" onClick={async () => { await api.respondToFriendRequest(request.id, 'decline'); refresh() }}>Neka</button>
                    </div>
                  </article>
                ))}
                {snapshot.requests.outgoing.map((request) => (
                  <article key={request.id}>
                    <strong>Skickad till {request.profile?.displayName || 'användare'}</strong>
                    <small>Väntar</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="overview-social-empty">Inga vänförfrågningar.</p>
            )
          ) : null}
          {view === 'search' ? (
            <form className="social-search" onSubmit={onSearch}>
              <label>
                Sök användarnamn
                <input
                  autoComplete="off"
                  inputMode="text"
                  placeholder="användarnamn"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <button className="primary-button" type="submit">Sök</button>
              <ul className="overview-social-list">
                {results.map((profile) => (
                  <li className="social-friend-row" key={profile.userId}>
                    <strong>{profile.displayName}</strong>
                    <small>@{profile.username}</small>
                    <button className="secondary-button" type="button" onClick={async () => { await api.sendFriendRequest(profile.userId); refresh(); setView('requests') }}>
                      Skicka vänförfrågan
                    </button>
                  </li>
                ))}
              </ul>
            </form>
          ) : null}
          {view === 'thread' ? (
            <div className="social-thread">
              {messages.length ? (
                <ul className="social-message-list">
                  {messages.map((message) => (
                    <li key={message.id}>
                      <p>{message.body}</p>
                      <time>{formatTime(message.created_at)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="overview-social-empty">Inga meddelanden ännu.</p>
              )}
              <form className="social-compose" onSubmit={sendDraft}>
                <label className="sr-only" htmlFor="social-compose-input">Meddelande</label>
                <input
                  id="social-compose-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Skriv ett meddelande"
                />
                <button className="primary-button" type="submit">Skicka</button>
              </form>
            </div>
          ) : null}
        </div>
      )}
    </div>,
    overlay,
  )
}

export default SocialStage
