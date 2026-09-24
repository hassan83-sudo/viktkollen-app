import { useId } from 'react'
import { useTranslation } from 'react-i18next'

// A11Y-8D:
// - the text field has a stable, localized accessible name (a visually hidden
//   <label>), independent of the placeholder;
// - focusing the field no longer ends an active voice conversation. Ending
//   the conversation is an explicit action on the voice button only, so
//   tabbing into the field never causes an unexpected change of context
//   (WCAG 3.2.1). Typing and sending text stay available during a call.
function ChatInput({
  chatInput,
  isAiVoiceEnabled,
  isListening,
  isVoiceConversationActive,
  onAiVoiceEnabledChange,
  onChatInputChange,
  onSendChatMessage,
  onStartVoiceInput,
}) {
  const { t } = useTranslation('coach')
  const inputId = useId()
  const voiceButtonLabel = isVoiceConversationActive
    ? t('chatInput.endVoice')
    : t('chatInput.startVoice')

  return (
    <form className={`chat-form ${isVoiceConversationActive ? 'voice-conversation-active' : ''}`} onSubmit={onSendChatMessage}>
      <label className="sr-only" htmlFor={inputId}>{t('chatInput.label')}</label>
      <input
        id={inputId}
        type="text"
        value={chatInput}
        onChange={(event) => onChatInputChange(event.target.value)}
        placeholder={t('chatInput.placeholder')}
        enterKeyHint="send"
      />
      <button
        className={`mic-button ${isListening ? 'listening' : ''} ${isVoiceConversationActive ? 'conversation-active' : ''}`}
        type="button"
        onClick={onStartVoiceInput}
        aria-label={voiceButtonLabel}
        title={voiceButtonLabel}
      >
        {isVoiceConversationActive ? voiceButtonLabel : <span aria-hidden="true">🎙️</span>}
      </button>
      <button className="send-button" type="submit">{t('chatInput.send')}</button>
      <div className="voice-conversation-controls">
        <label className="voice-toggle">
          <input
            type="checkbox"
            checked={isAiVoiceEnabled}
            onChange={(event) => onAiVoiceEnabledChange(event.target.checked)}
          />
          <span>{t('chatInput.aiVoice')}</span>
        </label>
      </div>
    </form>
  )
}

export default ChatInput
