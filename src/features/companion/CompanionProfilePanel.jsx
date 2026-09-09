import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getReadyAvatar, getReadyAvatars } from '../ready/readyAvatars.js'
import {
  companionAgeStyles,
  companionCommunicationPreferences,
  companionDirectnessLevels,
  companionEmojiPreferences,
  companionEncouragementLevels,
  companionReminderSuggestionPreferences,
  companionResponseLengths,
  companionSignLanguageIds,
  companionToneIds,
  deleteCompanionProfile,
  loadCompanionProfile,
  resetCompanionProfile,
  saveCompanionProfile,
} from './companionModel.js'

function optionKey(id) {
  return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function CompanionProfilePanel({ mode = 'full', onProfileChange, surface = 'coach' }) {
  const { t } = useTranslation(['companion', 'ready', 'common'])
  const [profile, setProfile] = useState(() => loadCompanionProfile())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const avatar = getReadyAvatar(profile.avatarId)
  const compact = mode === 'compact'

  function patchProfile(patch) {
    const next = saveCompanionProfile({ ...profile, ...patch })
    setProfile(next)
    onProfileChange?.(next)
  }

  function resetProfile() {
    const next = resetCompanionProfile()
    setProfile(next)
    onProfileChange?.(next)
    setConfirmingDelete(false)
  }

  function confirmDelete() {
    const result = deleteCompanionProfile('radera ai-kompis')
    setProfile(result.profile)
    onProfileChange?.(result.profile)
    setConfirmingDelete(false)
  }

  return (
    <section className={`companion-panel is-${surface}`} aria-labelledby={`companion-${surface}-title`}>
      <div className="companion-panel-heading">
        <span className={`ready-avatar-button is-${avatar.accent}`} aria-hidden="true">🤖</span>
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id={`companion-${surface}-title`}>{profile.displayName}</h2>
          <p>{t(`preview.${profile.tone}`)}</p>
        </div>
      </div>

      {!compact ? (
        <div className="companion-cards-container">
          <section className="companion-card companion-personality-card" aria-labelledby={`companion-${surface}-personality-title`}>
            <h3 id={`companion-${surface}-personality-title`} className="companion-card-title">
              {t('sections.personality', 'Personlighet')}
            </h3>
            <div className="companion-card-fields">
              <label>
                <span className="companion-field-label">{t('fields.name')}</span>
                <input
                  type="text"
                  value={profile.displayName}
                  onChange={(event) => patchProfile({ displayName: event.target.value })}
                />
              </label>
              <label>
                <span className="companion-field-label">{t('fields.pronouns')}</span>
                <input
                  type="text"
                  placeholder={t('placeholders.pronouns', t('common:optional', 'Valfritt'))}
                  value={profile.pronouns}
                  onChange={(event) => patchProfile({ pronouns: event.target.value })}
                />
              </label>
              <label>
                <span className="companion-field-label">{t('fields.ageStyle')}</span>
                <select
                  value={profile.ageStyle}
                  onChange={(event) => patchProfile({ ageStyle: event.target.value })}
                >
                  {companionAgeStyles.map((id) => (
                    <option key={id} value={id}>
                      {t(`ageStyles.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="companion-field-label">{t('fields.tone')}</span>
                <select
                  value={profile.tone}
                  onChange={(event) => patchProfile({ tone: event.target.value })}
                >
                  {companionToneIds.map((id) => (
                    <option key={id} value={id}>
                      {t(`tones.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="companion-card companion-style-card" aria-labelledby={`companion-${surface}-style-title`}>
            <h3 id={`companion-${surface}-style-title`} className="companion-card-title">
              {t('sections.responseStyle', 'Svarsstil')}
            </h3>
            <div className="companion-card-fields">
              <label>
                <span className="companion-field-label">{t('fields.responseLength')}</span>
                <select
                  value={profile.responseLength}
                  onChange={(event) => patchProfile({ responseLength: event.target.value })}
                >
                  {companionResponseLengths.map((id) => (
                    <option key={id} value={id}>
                      {t(`responseLengths.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="companion-field-label">{t('fields.directness')}</span>
                <select
                  value={profile.directness}
                  onChange={(event) => patchProfile({ directness: event.target.value })}
                >
                  {companionDirectnessLevels.map((id) => (
                    <option key={id} value={id}>
                      {t(`directness.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="companion-field-label">{t('fields.encouragement')}</span>
                <select
                  value={profile.encouragementLevel}
                  onChange={(event) => patchProfile({ encouragementLevel: event.target.value })}
                >
                  {companionEncouragementLevels.map((id) => (
                    <option key={id} value={id}>
                      {t(`encouragement.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="companion-field-label">{t('fields.emoji')}</span>
                <select
                  value={profile.emojiPreference}
                  onChange={(event) => patchProfile({ emojiPreference: event.target.value })}
                >
                  {companionEmojiPreferences.map((id) => (
                    <option key={id} value={id}>
                      {t(`emoji.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="companion-field-label">{t('fields.reminders')}</span>
                <select
                  value={profile.reminderSuggestionPreference}
                  onChange={(event) => patchProfile({ reminderSuggestionPreference: event.target.value })}
                >
                  {companionReminderSuggestionPreferences.map((id) => (
                    <option key={id} value={id}>
                      {t(`reminders.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="companion-card companion-communication-card" aria-labelledby={`companion-${surface}-communication-title`}>
            <h3 id={`companion-${surface}-communication-title`} className="companion-card-title">
              {t('sections.communication', 'Kommunikation')}
            </h3>
            <div className="companion-card-fields">
              <label>
                <span className="companion-field-label">{t('fields.communication')}</span>
                <select
                  value={profile.communicationPreference}
                  onChange={(event) => patchProfile({ communicationPreference: event.target.value })}
                >
                  {companionCommunicationPreferences.map((id) => (
                    <option key={id} value={id}>
                      {t(`communication.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="companion-field-label">{t('fields.signLanguage')}</span>
                <select
                  value={profile.selectedSignLanguage}
                  onChange={(event) => patchProfile({ selectedSignLanguage: event.target.value })}
                >
                  {companionSignLanguageIds.map((id) => (
                    <option key={id} value={id}>
                      {t(`signLanguages.${optionKey(id)}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="companion-check-row education-check-row">
                <input
                  type="checkbox"
                  checked={profile.prefersSpeech}
                  onChange={(event) => patchProfile({ prefersSpeech: event.target.checked })}
                />
                <span>{t('fields.speech')}</span>
              </label>
            </div>
          </section>

          <section className="companion-card companion-voice-card" aria-labelledby={`companion-${surface}-voice-title`}>
            <h3 id={`companion-${surface}-voice-title`} className="companion-card-title">
              {t('sections.voice', 'AI-röst')}
            </h3>
            <div className="ready-avatar-grid companion-avatar-grid">
              {getReadyAvatars().map((entry) => (
                <button
                  className={`ready-avatar-choice${profile.avatarId === entry.id ? ' is-active' : ''}`}
                  key={entry.id}
                  type="button"
                  onClick={() => patchProfile({ avatarId: entry.id })}
                >
                  <span className={`ready-avatar-mini is-${entry.accent}`} aria-hidden="true">🤖</span>
                  <strong>{t(`ready:${entry.labelKey}`)}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="companion-card companion-management-card" aria-labelledby={`companion-${surface}-management-title`}>
            <h3 id={`companion-${surface}-management-title`} className="companion-card-title">
              {t('sections.management', 'Profilhantering')}
            </h3>
            <div className="companion-actions">
              <button className="secondary-button" type="button" onClick={resetProfile}>
                {t('actions.reset')}
              </button>
              {!confirmingDelete ? (
                <button className="secondary-button danger-button" type="button" onClick={() => setConfirmingDelete(true)}>
                  {t('actions.delete')}
                </button>
              ) : (
                <div className="companion-delete-confirm">
                  <button className="secondary-button danger-button" type="button" onClick={confirmDelete}>
                    {t('actions.confirmDelete')}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)}>
                    {t('common:actions.cancel')}
                  </button>
                </div>
              )}
            </div>
            <p className="estimate-note companion-safety-note">{t('safety')}</p>
          </section>
        </div>
      ) : (
        <p className="estimate-note companion-safety-note">{t('safety')}</p>
      )}
    </section>
  )
}

export default CompanionProfilePanel
