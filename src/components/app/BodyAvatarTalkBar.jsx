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
      <button
        className={`body-avatar-mic ${isListening ? 'is-listening' : ''} ${isAiSpeaking ? 'is-speaking' : ''}`}
        type="button"
        aria-label={isVoiceConversationActive ? 'Avsluta samtal' : 'Prata'}
        onClick={onStartVoiceInput}
      >
        🎙 Prata
      </button>
      <p className="body-avatar-talk-status" aria-live="polite">{phaseLabel}</p>
      <div className="body-avatar-talk-actions">
        <button className="secondary-button" type="button" onClick={onStartVoiceInput} disabled={!isVoiceConversationActive}>
          Avsluta
        </button>
        <button className="secondary-button" type="button" onClick={onToggleVoiceMute} disabled={!isVoiceConversationActive}>
          {isVoiceMuted ? 'Slå på mikrofon' : 'Mute'}
        </button>
        <button className="secondary-button" type="button" onClick={onStopAiVoiceResponse} disabled={!isAiSpeaking}>
          Avbryt svar
        </button>
        <button className="secondary-button" type="button" onClick={onToggleText}>
          {showText ? 'Dölj text' : 'Textalternativ'}
        </button>
      </div>
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
