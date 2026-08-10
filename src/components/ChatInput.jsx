function ChatInput({
  chatInput,
  isAiSpeaking,
  isAiVoiceEnabled,
  isListening,
  isVoiceConversationActive,
  onAiVoiceEnabledChange,
  onChatInputChange,
  onSendChatMessage,
  onStopAiVoiceResponse,
  onStartVoiceInput,
}) {
  const voiceButtonLabel = isVoiceConversationActive
    ? 'Avsluta samtal'
    : 'Starta röstsamtal'

  return (
    <form className={`chat-form ${isVoiceConversationActive ? 'voice-conversation-active' : ''}`} onSubmit={onSendChatMessage}>
      <input
        type="text"
        value={chatInput}
        onChange={(event) => onChatInputChange(event.target.value)}
        placeholder="Skriv en fråga..."
        enterKeyHint="send"
      />
      <button
        className={`mic-button ${isListening ? 'listening' : ''} ${isVoiceConversationActive ? 'conversation-active' : ''}`}
        type="button"
        onClick={onStartVoiceInput}
        aria-label={voiceButtonLabel}
        title={voiceButtonLabel}
      >
        {isVoiceConversationActive ? 'Avsluta samtal' : '🎙️'}
      </button>
      <button className="send-button" type="submit">Skicka</button>
      {isVoiceConversationActive && (
        <div className="voice-conversation-controls">
          <label className="voice-toggle">
            <input
              type="checkbox"
              checked={isAiVoiceEnabled}
              onChange={(event) => onAiVoiceEnabledChange(event.target.checked)}
            />
            <span>AI-röst</span>
          </label>
          <button
            className="voice-secondary-button"
            type="button"
            onClick={onStopAiVoiceResponse}
            disabled={!isAiSpeaking}
          >
            Avbryt svar
          </button>
        </div>
      )}
    </form>
  )
}

export default ChatInput
