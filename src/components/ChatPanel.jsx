import ChatInput from './ChatInput.jsx'
import ChatMessageList from './ChatMessageList.jsx'
import QuickActions from './QuickActions.jsx'

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

      <QuickActions
        onStarterPrompt={onStarterPrompt}
        starterPrompts={starterPrompts}
      />

      <ChatMessageList
        chatMessages={chatMessages}
        chatThreadRef={chatThreadRef}
        messagesEndRef={messagesEndRef}
      />

      <ChatInput
        chatInput={chatInput}
        isListening={isListening}
        onChatInputChange={onChatInputChange}
        onSendChatMessage={onSendChatMessage}
        onStartVoiceInput={onStartVoiceInput}
      />
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
