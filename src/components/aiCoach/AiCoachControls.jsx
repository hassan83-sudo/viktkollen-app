import { useTranslation } from 'react-i18next'

function AiCoachControls({
  canClearChat,
  isAiSpeaking,
  isListening,
  isVoiceConversationActive,
  isVoiceMuted,
  onClearChat,
  onStartVoiceInput,
  onStopAiVoiceResponse,
  onToggleVoiceMute,
  phaseLabel,
}) {
  const { t } = useTranslation(['coach'])

  // A11Y-8D: the main voice button always does what its name says. While the
  // AI speaks it stops the answer; otherwise it toggles the conversation
  // through the existing start/end handler (onStartVoiceInput ends an active
  // conversation). Previously an active, silent conversation made it a no-op
  // named only by status ("Lyssnar").
  const mainVoiceLabel = isAiSpeaking
    ? t('coach:overlay.stopResponse')
    : isVoiceConversationActive
      ? t('coach:overlay.endCall')
      : t('coach:overlay.startVoice')

  function handleMainMicClick() {
    if (isAiSpeaking) {
      onStopAiVoiceResponse?.()
      return
    }

    onStartVoiceInput?.()
  }

  return (
    <div className="ai-coach-overlay-voice">
      <button
        className={`ai-coach-overlay-mic ${isListening ? 'is-listening' : ''} ${isAiSpeaking ? 'is-speaking' : ''}`}
        type="button"
        aria-label={mainVoiceLabel}
        onClick={handleMainMicClick}
      >
        <span aria-hidden="true">🎙️</span>
      </button>
      <p className="ai-coach-overlay-status" aria-live="polite">{phaseLabel}</p>
      <div className="ai-coach-overlay-actions">
        <button className="secondary-button" type="button" onClick={onStartVoiceInput} disabled={!isVoiceConversationActive}>
          {t('coach:overlay.end')}
        </button>
        <button className="secondary-button" type="button" onClick={onToggleVoiceMute} disabled={!isVoiceConversationActive}>
          {isVoiceMuted ? t('coach:overlay.unmute') : t('coach:overlay.mute')}
        </button>
        <button className="secondary-button" type="button" onClick={onClearChat} disabled={!canClearChat}>
          {t('coach:overlay.clearChat')}
        </button>
        <button className="secondary-button" type="button" onClick={onStopAiVoiceResponse} disabled={!isAiSpeaking}>
          {t('coach:overlay.stopResponse')}
        </button>
      </div>
    </div>
  )
}

export default AiCoachControls
