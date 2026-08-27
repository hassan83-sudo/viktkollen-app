import { useTranslation } from 'react-i18next'
import { supportedLanguages } from '../i18n/languages.js'

function LanguageSettingsPanel({ language, onLanguageChange }) {
  const { t } = useTranslation('settings')

  return (
    <section className="panel profile-settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('language.title')}</p>
          <h2>{t('language.label')}</h2>
        </div>
      </div>
      <p className="settings-note">{t('language.description')}</p>
      <label className="field">
        <span>{t('language.label')}</span>
        <select value={language} onChange={(event) => onLanguageChange?.(event.target.value)}>
          {supportedLanguages.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.nativeName}
            </option>
          ))}
        </select>
      </label>
      <p className="settings-note">{t('language.help')}</p>
    </section>
  )
}

export default LanguageSettingsPanel
