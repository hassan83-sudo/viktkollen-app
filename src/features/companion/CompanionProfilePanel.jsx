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
        <span className={`ready-avatar-button is-${avatar.accent}`} aria-hidden="true">AI</span>
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id={`companion-${surface}-title`}>{profile.displayName}</h2>
          <p>{t(`preview.${profile.tone}`)}</p>
        </div>
      </div>

      {!compact && (
        <>
          <div className="companion-form-grid">
            <label>
              {t('fields.name')}
              <input value={profile.displayName} onChange={(event) => patchProfile({ displayName: event.target.value })} />
            </label>
            <label>
              {t('fields.pronouns')}
              <input value={profile.pronouns} onChange={(event) => patchProfile({ pronouns: event.target.value })} />
            </label>
            <label>
              {t('fields.ageStyle')}
              <select value={profile.ageStyle} onChange={(event) => patchProfile({ ageStyle: event.target.value })}>
                {companionAgeStyles.map((id) => <option key={id} value={id}>{t(`ageStyles.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label>
              {t('fields.tone')}
              <select value={profile.tone} onChange={(event) => patchProfile({ tone: event.target.value })}>
                {companionToneIds.map((id) => <option key={id} value={id}>{t(`tones.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label>
              {t('fields.responseLength')}
              <select value={profile.responseLength} onChange={(event) => patchProfile({ responseLength: event.target.value })}>
                {companionResponseLengths.map((id) => <option key={id} value={id}>{t(`responseLengths.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label>
              {t('fields.directness')}
              <select value={profile.directness} onChange={(event) => patchProfile({ directness: event.target.value })}>
                {companionDirectnessLevels.map((id) => <option key={id} value={id}>{t(`directness.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label>
              {t('fields.encouragement')}
              <select value={profile.encouragementLevel} onChange={(event) => patchProfile({ encouragementLevel: event.target.value })}>
                {companionEncouragementLevels.map((id) => <option key={id} value={id}>{t(`encouragement.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label>
              {t('fields.emoji')}
              <select value={profile.emojiPreference} onChange={(event) => patchProfile({ emojiPreference: event.target.value })}>
                {companionEmojiPreferences.map((id) => <option key={id} value={id}>{t(`emoji.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label>
              {t('fields.reminders')}
              <select value={profile.reminderSuggestionPreference} onChange={(event) => patchProfile({ reminderSuggestionPreference: event.target.value })}>
                {companionReminderSuggestionPreferences.map((id) => <option key={id} value={id}>{t(`reminders.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label>
              {t('fields.communication')}
              <select value={profile.communicationPreference} onChange={(event) => patchProfile({ communicationPreference: event.target.value })}>
                {companionCommunicationPreferences.map((id) => <option key={id} value={id}>{t(`communication.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label>
              {t('fields.signLanguage')}
              <select value={profile.selectedSignLanguage} onChange={(event) => patchProfile({ selectedSignLanguage: event.target.value })}>
                {companionSignLanguageIds.map((id) => <option key={id} value={id}>{t(`signLanguages.${optionKey(id)}`)}</option>)}
              </select>
            </label>
            <label className="education-check-row">
              <input type="checkbox" checked={profile.prefersSpeech} onChange={(event) => patchProfile({ prefersSpeech: event.target.checked })} />
              {t('fields.speech')}
            </label>
          </div>

          <div className="ready-avatar-grid companion-avatar-grid">
            {getReadyAvatars().map((entry) => (
              <button
                className={`ready-avatar-choice${profile.avatarId === entry.id ? ' is-active' : ''}`}
                key={entry.id}
                type="button"
                onClick={() => patchProfile({ avatarId: entry.id })}
              >
                <span aria-hidden="true">AI</span>
                <strong>{t(`ready:${entry.labelKey}`)}</strong>
              </button>
            ))}
          </div>

          <div className="education-actions">
            <button className="secondary-button" type="button" onClick={resetProfile}>{t('actions.reset')}</button>
            {!confirmingDelete ? (
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(true)}>{t('actions.delete')}</button>
            ) : (
              <>
                <button className="secondary-button" type="button" onClick={confirmDelete}>{t('actions.confirmDelete')}</button>
                <button type="button" onClick={() => setConfirmingDelete(false)}>{t('common:actions.cancel')}</button>
              </>
            )}
          </div>
        </>
      )}

      <p className="estimate-note">{t('safety')}</p>
    </section>
  )
}

export default CompanionProfilePanel
