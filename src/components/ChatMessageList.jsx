function ChatMessageList({ chatMessages, chatThreadRef, messagesEndRef }) {
  return (
    <div ref={chatThreadRef} className="chat-thread" aria-live="polite">
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
