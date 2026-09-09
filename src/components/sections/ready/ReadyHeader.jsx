import { useTranslation } from 'react-i18next'
import { readyLevels } from '../../../features/ready/readyModel.js'

function ReadyHeader({ greeting, levelId, onLevelChange, avatar, onAvatarClick }) {
  const { t } = useTranslation(['ready', 'common'])

  return (
    <header className="ready-header">
      <div>
        <h1 className="ready-title">{t('title')}</h1>
        <p className="ready-greeting">{greeting}</p>
      </div>
      <div className="ready-header-actions">
        <label className="ready-level-pill">
          <span className="sr-only">{t('levelLabel')}</span>
          <select
            aria-label={t('levelLabel')}
            value={levelId || ''}
            onChange={(event) => onLevelChange(event.target.value || null)}
          >
            <option value="">{t('levelPlaceholder')}</option>
            {readyLevels.map((level) => (
              <option key={level.id} value={level.id}>{t(level.labelKey)}</option>
            ))}
          </select>
        </label>
        <button
          aria-label={t('avatar.pick')}
          className={`ready-avatar-button is-${avatar.accent}`}
          type="button"
          onClick={onAvatarClick}
        >
          <span aria-hidden="true">🤖</span>
        </button>
      </div>
    </header>
  )
}

export default ReadyHeader
