import { useTranslation } from 'react-i18next'

function initialsFor(profile) {
  const source = profile?.displayName || profile?.username || ''
  const parts = source.split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('sv-SE')).join('')
}

function HomeSocialPreview({
  compact = false,
  conversations = [],
  enabled = false,
  error = '',
  heading = '',
  isAuthenticated = false,
  liveEnabled = false,
  loading = false,
  onAddFriend,
  onOpenChat,
} = {}) {
  const { t } = useTranslation(['social', 'common'])
  if (!enabled) return null

  const rows = Array.isArray(conversations) ? conversations.slice(0, 3) : []
  const hasFriendsChat = liveEnabled && rows.length > 0

  return (
    <section className={compact ? 'overview-social-card is-compact' : 'overview-social-card'} aria-label={heading || t('social:friends')}>
      <div className="overview-social-card-top">
        <h3>{heading || t('social:friends')}</h3>
        {isAuthenticated && onOpenChat ? (
          <button className="overview-stat-link" type="button" onClick={() => onOpenChat()}>
            {t('social:openChat')}
          </button>
        ) : null}
      </div>
      {!isAuthenticated ? (
        <p className="overview-social-empty">{t('social:signInToUse')}</p>
      ) : !liveEnabled ? (
        <p className="overview-social-empty">{t('social:signInCloud')}</p>
      ) : loading ? (
        <p className="overview-social-empty">{t('common:actions.loading')}</p>
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
                  <strong>{row.other?.displayName || row.other?.username || t('social:friend', 'Friend')}</strong>
                  <small>{row.lastMessage || t('social:noConversationYet', 'No conversation yet')}</small>
                </span>
                {row.unreadCount > 0 ? <span className="overview-social-unread">{row.unreadCount}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="overview-social-empty">{t('social:trainingTogether')}</p>
      )}
      {isAuthenticated ? (
        <div className="overview-social-actions">
          <button className="secondary-button" type="button" onClick={onAddFriend}>{t('social:addFriend')}</button>
          {hasFriendsChat ? (
            <button className="primary-button" type="button" onClick={() => onOpenChat()}>{t('social:openChat')}</button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default HomeSocialPreview
