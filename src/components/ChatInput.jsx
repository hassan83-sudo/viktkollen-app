function ChatInput({
  chatInput,
  isListening,
  isVoiceConversationActive,
  onChatInputChange,
  onSendChatMessage,
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
    </form>
  )
}

export default ChatInput
