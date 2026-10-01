function ChatMessageList({ chatMessages, chatThreadRef, emptyLabel = '', messagesEndRef }) {
  return (
    <div ref={chatThreadRef} className="chat-thread" aria-live="polite">
      {chatMessages.length === 0 && emptyLabel ? <p className="chat-empty">{emptyLabel}</p> : null}
      {chatMessages.map((message) => (
        <div className={`chat-message ${message.role}`} key={message.id}>
          <span>{message.role === 'user' ? 'Du' : 'AI-coach'}</span>
          <p>{message.text}</p>
        </div>
      ))}
      <div ref={messagesEndRef} className="messages-end" aria-hidden="true" />
    </div>
  )
}

export default ChatMessageList
