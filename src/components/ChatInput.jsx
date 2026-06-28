function ChatInput({
  chatInput,
  isListening,
  onChatInputChange,
  onSendChatMessage,
  onStartVoiceInput,
}) {
  return (
    <form className="chat-form" onSubmit={onSendChatMessage}>
      <input
        type="text"
        value={chatInput}
        onChange={(event) => onChatInputChange(event.target.value)}
        placeholder="Skriv en fråga..."
        enterKeyHint="send"
      />
      <button
        className={`mic-button ${isListening ? 'listening' : ''}`}
        type="button"
        onClick={onStartVoiceInput}
        aria-label="Starta röstinmatning"
        title="Starta röstinmatning"
      >
        {isListening ? 'Lyssnar' : '🎙️'}
      </button>
      <button className="send-button" type="submit">Skicka</button>
    </form>
  )
}

export default ChatInput
