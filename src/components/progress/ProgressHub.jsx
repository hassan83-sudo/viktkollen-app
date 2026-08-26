import { useTranslation } from 'react-i18next'

import { progressHubFolders } from './progressHubModel.js'

const folderTranslationKeys = {
  weight: 'folders.weight',
  'body-scan': 'folders.bodyScan',
  photos: 'folders.photos',
  reports: 'folders.reports',
  tools: 'folders.tools',
}

function ProgressHub({ activeFolder, children, onBack, onOpen, summaries = {} }) {
  const { t } = useTranslation('progress')
  const folder = progressHubFolders.find((entry) => entry.id === activeFolder) || null
  const folderKey = folder ? folderTranslationKeys[folder.id] : null

  if (folder) {
    return (
      <div className="progress-hub-view">
        <button className="progress-hub-back" type="button" onClick={onBack}>
          {t('back')}
        </button>
        <header className="progress-hub-view-heading">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t(`${folderKey}.title`)}</h1>
        </header>
        {children}
      </div>
    )
  }

  return (
    <div className="progress-hub">
      <header className="progress-hub-heading">
        <p className="eyebrow">{t('centerEyebrow')}</p>
        <h1>{t('title')}</h1>
        <p>{t('intro')}</p>
      </header>
      <nav className="progress-hub-folders" aria-label={t('foldersAria')}>
        {progressHubFolders.map((entry) => {
          const summary = summaries[entry.id] || {}
          const key = folderTranslationKeys[entry.id]
          return (
            <button
              className="progress-hub-folder"
              key={entry.id}
              type="button"
              onClick={() => onOpen(entry.id)}
            >
              <span>
                <strong>{t(`${key}.title`)}</strong>
                <small>{summary.primary || t(`${key}.description`)}</small>
                {summary.secondary ? <small>{summary.secondary}</small> : null}
              </span>
              <span aria-hidden="true">›</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default ProgressHub
