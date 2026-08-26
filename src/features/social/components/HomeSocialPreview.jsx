function initialsFor(profile) {
  const source = profile?.displayName || profile?.username || ''
  const parts = source.split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('sv-SE')).join('')
}

function HomeSocialPreview({
  conversations = [],
  enabled = false,
  error = '',
  isAuthenticated = false,
  loading = false,
  onAddFriend,
  onOpenChat,
} = {}) {
  if (!enabled) return null

  const rows = Array.isArray(conversations) ? conversations.slice(0, 3) : []
  const hasFriendsChat = rows.length > 0

  return (
    <section className="overview-social-card" aria-label="Vänner">
      <div className="overview-social-card-top">
        <h3>Vänner</h3>
        {isAuthenticated && onOpenChat ? (
          <button className="overview-stat-link" type="button" onClick={() => onOpenChat()}>
            Öppna chatten
          </button>
        ) : null}
      </div>
      {!isAuthenticated ? (
        <p className="overview-social-empty">Logga in för att träna och hålla kontakten tillsammans.</p>
      ) : loading ? (
        <p className="overview-social-empty">Hämtar…</p>
      ) : error ? (
        <p className="overview-social-empty">{error}</p>
      ) : hasFriendsChat ? (
        <ul className="overview-social-list">
          {rows.map((row) => (
            <li key={row.conversationId}>
              <button className="overview-social-row" type="button" onClick={() => onOpenChat?.(row)}>
                <span className="overview-social-avatar" aria-hidden="true">
                  {row.other?.avatarUrl
                    ? <img alt="" src={row.other.avatarUrl} />
                    : initialsFor(row.other)}
                </span>
                <span className="overview-social-copy">
                  <strong>{row.other?.displayName || row.other?.username || 'Vän'}</strong>
                  <small>{row.lastMessage || 'Ingen konversation ännu'}</small>
                </span>
                {row.unreadCount > 0 ? <span className="overview-social-unread">{row.unreadCount}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="overview-social-empty">Träna och håll kontakten tillsammans.</p>
      )}
      {isAuthenticated ? (
        <div className="overview-social-actions">
          <button className="secondary-button" type="button" onClick={onAddFriend}>Lägg till vän</button>
          {hasFriendsChat ? (
            <button className="primary-button" type="button" onClick={() => onOpenChat()}>Öppna chatten</button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default HomeSocialPreview
