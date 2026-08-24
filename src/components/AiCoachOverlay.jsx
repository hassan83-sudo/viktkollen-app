import { createPortal } from 'react-dom'
import ChatPanel from './ChatPanel.jsx'
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
      <header className="ai-coach-overlay-header">
        <div>
          <p className="eyebrow">AI Coach</p>
          <h2 id="ai-coach-overlay-title">AI Coach</h2>
          <p className="ai-coach-overlay-online">● Online</p>
        </div>
        <button className="ai-coach-overlay-close" type="button" onClick={onClose} aria-label="Stäng AI Coach">
          X
        </button>
      </header>

      <div className="ai-coach-overlay-hero">
        <img alt="Viktkollens AI Coach" src="/viktkollen-ai-coach-robot.png" />
      </div>

      <div className="ai-coach-overlay-voice">
        <button
          className={`ai-coach-overlay-mic ${isListening ? 'is-listening' : ''} ${isAiSpeaking ? 'is-speaking' : ''}`}
          type="button"
          aria-label={isVoiceConversationActive ? 'Avsluta samtal' : 'Tryck för att prata'}
          onClick={onStartVoiceInput}
        >
          🎙️
        </button>
        <p className="ai-coach-overlay-status" aria-live="polite">{phaseLabel}</p>
        <div className="ai-coach-overlay-actions">
          <button className="secondary-button" type="button" onClick={onStartVoiceInput} disabled={!isVoiceConversationActive}>
            Avsluta
          </button>
          <button className="secondary-button" type="button" onClick={onToggleVoiceMute} disabled={!isVoiceConversationActive}>
            {isVoiceMuted ? 'Slå på mikrofon' : 'Mute'}
          </button>
          <button className="secondary-button" type="button" onClick={onStopAiVoiceResponse} disabled={!isAiSpeaking}>
            Avbryt svar
          </button>
        </div>
      </div>

      <div className="ai-coach-overlay-chat">
        <ChatPanel
          canClearChat={canClearChat}
          chatEngineStatus={chatEngineStatus}
          chatInput={chatInput}
          chatMessages={chatMessages}
          chatThreadRef={chatThreadRef}
          compact
          isAiSpeaking={isAiSpeaking}
          isAiVoiceEnabled={isAiVoiceEnabled}
          isListening={isListening}
          isVoiceConversationActive={isVoiceConversationActive}
          messagesEndRef={messagesEndRef}
          onAiVoiceEnabledChange={onAiVoiceEnabledChange}
          onChatInputChange={onChatInputChange}
          onClearChat={onClearChat}
          onSendChatMessage={onSendChatMessage}
          onStartVoiceInput={onStartVoiceInput}
          onStarterPrompt={onStarterPrompt}
          onStopAiVoiceResponse={onStopAiVoiceResponse}
          starterPrompts={starterPrompts}
          voiceStatus={voiceStatus}
        />
      </div>
    </div>,
    overlay,
  )
}

export default AiCoachOverlay
