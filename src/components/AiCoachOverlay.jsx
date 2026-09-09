import { createPortal } from 'react-dom'
import ChatInput from './ChatInput.jsx'
import ChatMessageList from './ChatMessageList.jsx'
import AiCoachHeader from './aiCoach/AiCoachHeader.jsx'
import AiCoachHero from './aiCoach/AiCoachHero.jsx'
import AiCoachControls from './aiCoach/AiCoachControls.jsx'
import AiCoachSuggestions from './aiCoach/AiCoachSuggestions.jsx'
import useOverviewStageLock from './app/useOverviewStageLock.js'
import { getVoicePhaseLabel } from '../services/ai/realtimeVoiceController.js'

function AiCoachOverlay({
  canClearChat,
  chatEngineStatus,
  chatInput,
  chatMessages,
  chatThreadRef,
  isAiSpeaking,
  isAiVoiceEnabled,
  isListening,
  isVoiceConversationActive,
  isVoiceMuted,
  messagesEndRef,
  onAiVoiceEnabledChange,
  onChatInputChange,
  onClearChat,
  onClose,
  onSendChatMessage,
  onStartVoiceInput,
  onStarterPrompt,
  onStopAiVoiceResponse,
  onToggleVoiceMute,
  starterPrompts,
  voiceStatus,
}) {
  useOverviewStageLock(onClose)
  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay) return null

  const phaseLabel = getVoicePhaseLabel({
    isAiSpeaking,
    isListening,
    isVoiceConversationActive,
    voiceStatus,
  })

  return createPortal(
    <div className="ai-coach-overlay" role="dialog" aria-labelledby="ai-coach-overlay-title" aria-modal="true">
      <AiCoachHeader onClose={onClose} />

      <AiCoachHero />

      <AiCoachControls
        canClearChat={canClearChat}
        isAiSpeaking={isAiSpeaking}
        isListening={isListening}
        isVoiceConversationActive={isVoiceConversationActive}
        isVoiceMuted={isVoiceMuted}
        onClearChat={onClearChat}
        onStartVoiceInput={onStartVoiceInput}
        onStopAiVoiceResponse={onStopAiVoiceResponse}
        onToggleVoiceMute={onToggleVoiceMute}
        phaseLabel={phaseLabel}
      />

      <div className="ai-coach-overlay-body">
        <AiCoachSuggestions onStarterPrompt={onStarterPrompt} starterPrompts={starterPrompts} />
        <ChatMessageList
          chatMessages={chatMessages}
          chatThreadRef={chatThreadRef}
          messagesEndRef={messagesEndRef}
        />
      </div>

      <div className="ai-coach-overlay-composer">
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
        {chatEngineStatus ? (
          <p className="chat-engine-status" aria-live="polite">
            {chatEngineStatus}
          </p>
        ) : null}
      </div>
    </div>,
    overlay,
  )
}

export default AiCoachOverlay
