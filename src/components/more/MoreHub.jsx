import { moreHubFolders } from '../../services/more/moreFolders.js'

function MoreHub({ activeFolder, children, isAuthenticated, onBack, onOpen, syncStatus = {} }) {
  const folder = moreHubFolders.find((entry) => entry.id === activeFolder) || null
  const online = syncStatus.online !== false
  const statusLabel = !isAuthenticated
    ? 'Logga in för molnsynk'
    : syncStatus.statusCode === 'synced' || syncStatus.statusLabel === 'Synkad'
      ? 'Allt är synkat'
      : syncStatus.statusLabel || (online ? 'Online' : 'Offline')

  if (folder) {
    return (
      <div className="more-hub-view">
        <button className="more-hub-back" type="button" onClick={onBack}>
          ← Tillbaka
        </button>
        <header className="more-hub-view-heading">
          <p className="eyebrow">Mer</p>
          <h1>{folder.title}</h1>
        </header>
        {children}
      </div>
    )
  }

  return (
    <div className="more-hub">
      <header className="more-hub-heading">
        <div className="more-hub-status" role="status">
          <span className={`more-hub-online${online ? ' is-online' : ''}`}>
            {online ? 'Online' : 'Offline'}
          </span>
          <span className="more-hub-status-copy" aria-hidden="true">☁</span>
          <span>{statusLabel}</span>
        </div>
        <h1>Mer</h1>
        <p className="more-hub-kategorier">Kategorier</p>
      </header>
      <nav className="more-hub-folders" aria-label="Mer-kategorier">
        {moreHubFolders.map((entry) => (
          <button
            aria-label={`${entry.title}. ${entry.description}`}
            className={`more-hub-folder accent-${entry.accent}`}
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry.id)}
          >
            <span className="more-hub-folder-icon" aria-hidden="true">{entry.icon}</span>
            <span className="more-hub-folder-copy">
              <strong>{entry.title}</strong>
              <small>{entry.description}</small>
            </span>
            <span className="more-hub-folder-chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default MoreHub
