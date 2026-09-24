import { moreHubFolders } from '../../services/more/moreFolders.js'
import SeniorEverydaySection from '../../features/senior/SeniorEverydaySection.jsx'
import DebtCaseSection from '../../features/economy/DebtCaseSection.jsx'
import ActivitySection from '../../features/activity/ActivitySection.jsx'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getOpenDialogCount } from '../../services/accessibilityDialog.js'
import { focusViewHeading, setDocumentSectionDetail } from '../../services/accessibilityNavigation.js'

const FOLDER_I18N_KEYS = {
  'ai-coach': 'coach',
  'animal-world': 'animalWorld',
  ekonomi: 'economy',
  'pregnancy-first-year': 'pregnancyFirstYear',
  accessibility: 'accessibility',
  'ma-bra': 'wellbeing',
  mat: 'nutrition',
  'sakerhet-backup': 'security',
  'sign-language': 'signLanguage',
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

function MoreHub({ activeFolder, children, isAuthenticated, onBack, onOpen, onOpenEye, syncStatus = {} }) {
  const { t } = useTranslation('settings')
  const folder = moreHubFolders.find((entry) => entry.id === activeFolder) || null
  const online = syncStatus.online !== false
  const statusLabel = !isAuthenticated
    ? t('more.signInForCloud')
    : syncStatus.statusCode === 'synced' || syncStatus.statusLabel === 'Synkad'
      ? t('more.synced')
      : syncStatus.statusLabel || (online ? t('more.online') : t('more.offline'))
  const folderTitle = folder ? folderCopy(t, folder).title : ''
  const viewRef = useRef(null)
  const folderButtonRefs = useRef({})
  const previousFolderRef = useRef(activeFolder)

  // A11Y-8E: an open folder names the page ("Tillgänglighet & hjälpmedel –
  // Viktkollen") while Mer is the active section.
  useEffect(() => {
    setDocumentSectionDetail('more', folderTitle || null)
  }, [folderTitle])
  useEffect(() => () => setDocumentSectionDetail('more', null), [])

  // A11Y-8E: opening a folder moves focus to its heading; going back returns
  // focus to the folder card that was open. Not on first render.
  useEffect(() => {
    const previous = previousFolderRef.current
    previousFolderRef.current = activeFolder
    if (previous === activeFolder || getOpenDialogCount() > 0) return
    if (!activeFolder && previous && folderButtonRefs.current[previous]) {
      folderButtonRefs.current[previous].focus({ preventScroll: true })
      return
    }
    focusViewHeading(viewRef.current)
  }, [activeFolder])

  if (folder) {
    const { title } = folderCopy(t, folder)
    return (
      <div className="more-hub-view" ref={viewRef}>
        <button className="more-hub-back" type="button" onClick={onBack}>
          ← {t('more.back')}
        </button>
        <header className="more-hub-view-heading">
          <p className="eyebrow">{t('more.heading')}</p>
          <h1>{title}</h1>
        </header>
        {folder.id === 'senior-65-plus' ? (
          <SeniorEverydaySection onOpenEye={onOpenEye} />
        ) : folder.id === 'aktivitet' ? (
          <ActivitySection />
        ) : folder.id === 'inkasso' ? (
          <DebtCaseSection type="inkasso" />
        ) : folder.id === 'kronofogden' ? (
          <DebtCaseSection type="kronofogden" />
        ) : children}
      </div>
    )
  }

  return (
    <div className="more-hub" ref={viewRef}>
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
              ref={(node) => {
                folderButtonRefs.current[entry.id] = node
              }}
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
