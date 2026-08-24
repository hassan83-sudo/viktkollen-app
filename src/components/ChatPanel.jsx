import ChatInput from './ChatInput.jsx'
import ChatMessageList from './ChatMessageList.jsx'
import QuickActions from './QuickActions.jsx'

function ChatPanel({
  canClearChat,
  chatEngineStatus,
  chatInput,
  chatMessages,
  chatThreadRef,
  compact = false,
  isAiSpeaking,
  isAiVoiceEnabled,
  isListening,
  isVoiceConversationActive,
  messagesEndRef,
  onAiVoiceEnabledChange,
  onChatInputChange,
  onClearChat,
  onSendChatMessage,
  onStopAiVoiceResponse,
  onStartVoiceInput,
  onStarterPrompt,
  starterPrompts,
  voiceStatus,
}) {
  return (
    <article className={`panel chat-panel ${compact ? 'is-compact' : ''}`} id="chat">
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

      <div className="coach-voice-dock">
        <button
          className={`coach-voice-mic ${isListening ? 'is-listening' : ''} ${isVoiceConversationActive ? 'is-active' : ''}`}
          type="button"
          aria-label={isVoiceConversationActive ? 'Avsluta samtal' : 'Tryck för att prata'}
          onClick={onStartVoiceInput}
        >
          🎙️
        </button>
        <p className="coach-voice-mic-label">
          {isVoiceConversationActive ? (voiceStatus || 'Lyssnar...') : 'Tryck för att prata'}
        </p>
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
        isAiSpeaking={isAiSpeaking}
        isAiVoiceEnabled={isAiVoiceEnabled}
        isListening={isListening}
        isVoiceConversationActive={isVoiceConversationActive}
        onAiVoiceEnabledChange={onAiVoiceEnabledChange}
        onChatInputChange={onChatInputChange}
        onSendChatMessage={onSendChatMessage}
        onStopAiVoiceResponse={onStopAiVoiceResponse}
        onStartVoiceInput={onStartVoiceInput}
      />
      {voiceStatus && (
        <p className="voice-status" aria-live="polite">
          {voiceStatus}
        </p>
      )}
      {isVoiceConversationActive && (
        <p className="voice-status" aria-live="polite">
          Tryck för att avsluta
        </p>
      )}
      {chatEngineStatus && (
        <p className="chat-engine-status" aria-live="polite">
          {chatEngineStatus}
        </p>
      )}
      <p className="chat-safety-note">
        AI-coachen ger allmänna råd om kost, vanor och motivation.
      </p>
    </article>
  )
}

export default ChatPanel
