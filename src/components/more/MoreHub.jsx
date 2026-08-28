import { moreHubFolders } from '../../services/more/moreFolders.js'
import { useTranslation } from 'react-i18next'

const FOLDER_I18N_KEYS = {
  'ai-coach': 'coach',
  'ma-bra': 'wellbeing',
  mat: 'nutrition',
  'sakerhet-backup': 'security',
  'import-export': 'importExport',
  'mal-framsteg': 'goals',
  'arkiv-historik': 'archive',
  installningar: 'settings',
}

function folderCopy(t, folder) {
  const key = FOLDER_I18N_KEYS[folder.id]
  if (!key) {
    return { description: folder.description, title: folder.title }
  }
  return {
    description: t(`folders.${key}.description`, { defaultValue: folder.description }),
    title: t(`folders.${key}.title`, { defaultValue: folder.title }),
  }
}

function MoreHub({ activeFolder, children, isAuthenticated, onBack, onOpen, syncStatus = {} }) {
  const { t } = useTranslation('settings')
  const folder = moreHubFolders.find((entry) => entry.id === activeFolder) || null
  const online = syncStatus.online !== false
  const statusLabel = !isAuthenticated
    ? t('more.signInForCloud')
    : syncStatus.statusCode === 'synced' || syncStatus.statusLabel === 'Synkad'
      ? t('more.synced')
      : syncStatus.statusLabel || (online ? t('more.online') : t('more.offline'))

  if (folder) {
    const { title } = folderCopy(t, folder)
    return (
      <div className="more-hub-view">
        <button className="more-hub-back" type="button" onClick={onBack}>
          ← {t('more.back')}
        </button>
        <header className="more-hub-view-heading">
          <p className="eyebrow">{t('more.heading')}</p>
          <h1>{title}</h1>
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
            {online ? t('more.online') : t('more.offline')}
          </span>
          <span className="more-hub-status-copy" aria-hidden="true">☁</span>
          <span>{statusLabel}</span>
        </div>
        <h1>{t('more.heading')}</h1>
        <p className="more-hub-kategorier">{t('more.categories')}</p>
      </header>
      <nav className="more-hub-folders" aria-label={`${t('more.heading')} ${t('more.categories').toLocaleLowerCase()}`}>
        {moreHubFolders.map((entry) => {
          const { description, title } = folderCopy(t, entry)
          return (
            <button
              aria-label={`${title}. ${description}`}
              className={`more-hub-folder accent-${entry.accent}`}
              key={entry.id}
              type="button"
              onClick={() => onOpen(entry.id)}
            >
              <span className="more-hub-folder-icon" aria-hidden="true">{entry.icon}</span>
              <span className="more-hub-folder-copy">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <span className="more-hub-folder-chevron" aria-hidden="true">›</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default MoreHub
