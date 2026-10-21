import { useTranslation } from 'react-i18next'

const localSources = new Set(['local', 'local-fallback', 'mock', 'knowledge-gap', 'context-gap', 'safety', 'other-domain'])

function ChatMessageList({ chatMessages, chatThreadRef, emptyLabel = '', messagesEndRef }) {
  const { t } = useTranslation('coach')
  return (
    <div ref={chatThreadRef} className="chat-thread" aria-live="polite">
      {chatMessages.length === 0 && emptyLabel ? <p className="chat-empty">{emptyLabel}</p> : null}
      {chatMessages.map((message) => (
        <div className={`chat-message ${message.role}`} key={message.id}>
          <span>{message.role === 'user' ? 'Du' : 'AI-coach'}</span>
          {message.role === 'assistant' && (
            <small className="chat-message-source">
              {t(`replySource.${message.source === 'openai' ? 'generated' : localSources.has(message.source) ? 'local' : 'unknown'}`)}
            </small>
          )}
          <p>{message.text}</p>
        </div>
      ))}
      <div ref={messagesEndRef} className="messages-end" aria-hidden="true" />
    </div>
  )
}

export default ChatMessageList
