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

  return (
    <div className="ai-coach-overlay-voice">
      <button
        className={`ai-coach-overlay-mic ${isListening ? 'is-listening' : ''} ${isAiSpeaking ? 'is-speaking' : ''}`}
        type="button"
        aria-label={isVoiceConversationActive ? t('coach:overlay.endCall', 'End call') : t('coach:overlay.startVoice')}
        onClick={onStartVoiceInput}
      >
        🎙️
      </button>
      <p className="ai-coach-overlay-status" aria-live="polite">{phaseLabel}</p>
      <div className="ai-coach-overlay-actions">
        <button className="secondary-button" type="button" onClick={onStartVoiceInput} disabled={!isVoiceConversationActive}>
          {t('coach:overlay.end')}
        </button>
        <button className="secondary-button" type="button" onClick={onToggleVoiceMute} disabled={!isVoiceConversationActive}>
          {isVoiceMuted ? t('coach:overlay.unmute') : t('coach:overlay.mute')}
        </button>
        <button className="secondary-button" type="button" onClick={onStopAiVoiceResponse} disabled={!isAiSpeaking}>
          {t('coach:overlay.stopResponse')}
        </button>
        <button className="secondary-button" type="button" onClick={onClearChat} disabled={!canClearChat}>
          {t('coach:overlay.clearChat')}
        </button>
      </div>
    </div>
  )
}

export default AiCoachControls
