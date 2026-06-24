function ChatPanel({
  canClearChat,
  chatInput,
  chatMessages,
  chatThreadRef,
  isListening,
  messagesEndRef,
  onChatInputChange,
  onClearChat,
  onSendChatMessage,
  onStartVoiceInput,
  onStarterPrompt,
  starterPrompts,
  voiceStatus,
}) {
  return (
    <article className="panel chat-panel" id="chat">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Coach</p>
          <h2 className="chat-title">Fråga AI-coachen</h2>
        </div>
        <button
          className="clear-chat-button"
          type="button"
          onClick={onClearChat}
          disabled={!canClearChat}
        >
          Rensa chatten
        </button>
      </div>

      <div className="starter-prompts" aria-label="Förslag på frågor">
        {starterPrompts.map((prompt) => (
          <button
            className="prompt-chip"
            type="button"
            key={prompt}
            onClick={() => onStarterPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div ref={chatThreadRef} className="chat-thread" aria-live="polite">
        {chatMessages.map((message) => (
          <div className={`chat-message ${message.role}`} key={message.id}>
            <span>{message.role === 'user' ? 'Du' : 'AI-coach'}</span>
            <p>{message.text}</p>
          </div>
        ))}
        <div ref={messagesEndRef} className="messages-end" aria-hidden="true" />
      </div>

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
      {voiceStatus && (
        <p className="voice-status" aria-live="polite">
          {voiceStatus}
        </p>
      )}
      <p className="chat-safety-note">
        AI-coachen ger allmänna råd om kost, vanor och motivation.
      </p>
    </article>
  )
}

export default ChatPanel
