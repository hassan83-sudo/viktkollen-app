import { getAvatarVoicePhaseLabel } from '../../services/ai/realtimeVoiceController.js'

function BodyAvatarTalkBar({
  chatInput = '',
  isAiSpeaking = false,
  isListening = false,
  isVoiceConversationActive = false,
  isVoiceMuted = false,
  onChatInputChange,
  onSendChatMessage,
  onStartVoiceInput,
  onStopAiVoiceResponse,
  onToggleVoiceMute,
  showText = false,
  onToggleText,
  voiceStatus = '',
}) {
  const phaseLabel = getAvatarVoicePhaseLabel({
    isAiSpeaking,
    isListening,
    isVoiceConversationActive,
    voiceStatus,
  })

  return (
    <section className="body-avatar-talk" aria-label="Prata med hälsokroppen">
      <div className="body-avatar-voice-bar">
        {!isVoiceConversationActive && (
          <button
            className="body-avatar-voice-start"
            type="button"
            aria-label="Prata"
            onClick={onStartVoiceInput}
          >
            🎙 Prata
          </button>
        )}
        <p className="body-avatar-talk-status" aria-live="polite">{phaseLabel}</p>
        {isVoiceConversationActive && (
          <div className="body-avatar-talk-actions">
            <button
              className="body-avatar-voice-action"
              type="button"
              aria-label={isVoiceMuted ? 'Slå på mikrofon' : 'Mute'}
              onClick={onToggleVoiceMute}
            >
              {isVoiceMuted ? 'Mic' : 'Mute'}
            </button>
            {isAiSpeaking && (
              <button
                className="body-avatar-voice-action"
                type="button"
                aria-label="Avbryt AI-svar"
                onClick={onStopAiVoiceResponse}
              >
                ⏸
              </button>
            )}
            <button
              className="body-avatar-voice-action is-stop"
              type="button"
              aria-label="Avsluta samtal"
              onClick={onStartVoiceInput}
            >
              ■
            </button>
          </div>
        )}
      </div>
      <button className="body-avatar-text-toggle" type="button" onClick={onToggleText}>
        ⌨ {showText ? 'Dölj text' : 'Text'}
      </button>
      {showText && (
        <form className="body-avatar-text-form" onSubmit={onSendChatMessage}>
          <label className="sr-only" htmlFor="body-avatar-chat-input">Skriv till hälsokroppen</label>
          <input
            id="body-avatar-chat-input"
            value={chatInput}
            onChange={(event) => onChatInputChange?.(event.target.value)}
            placeholder="Skriv en fråga"
          />
          <button className="primary-button" type="submit">Skicka</button>
        </form>
      )}
    </section>
  )
}

export default BodyAvatarTalkBar
