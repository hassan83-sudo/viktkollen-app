import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation(['coach'])
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
          <p className="eyebrow">{t('coach:overlay.title')}</p>
          <h2 id="ai-coach-overlay-title">{t('coach:overlay.title')}</h2>
          <p className="ai-coach-overlay-online">● {t('coach:overlay.online')}</p>
        </div>
        <button className="ai-coach-overlay-close" type="button" onClick={onClose} aria-label={t('coach:overlay.close')}>
          X
        </button>
      </header>

      <div className="ai-coach-overlay-hero">
        <img alt={t('coach:overlay.robotAlt')} src="/viktkollen-ai-coach-robot.png" />
      </div>

      <div className="ai-coach-overlay-voice">
        <button
          className={`ai-coach-overlay-mic ${isListening ? 'is-listening' : ''} ${isAiSpeaking ? 'is-speaking' : ''}`}
          type="button"
          aria-label={isVoiceConversationActive ? t('coach:overlay.endCall', 'End call') : t('coach:overlay.startVoice')}
          onClick={onStartVoiceInput}
        >
          🎙️
        </button>
        <p className="ai-coach-overlay-status" aria-live="polite">{phaseLabel}</p>
        <div className="ai-coach-overlay-actions">
          <button className="secondary-button" type="button" onClick={onStartVoiceInput} disabled={!isVoiceConversationActive}>
            {t('coach:overlay.end')}
          </button>
          <button className="secondary-button" type="button" onClick={onToggleVoiceMute} disabled={!isVoiceConversationActive}>
            {isVoiceMuted ? t('coach:overlay.unmute') : t('coach:overlay.mute')}
          </button>
          <button className="secondary-button" type="button" onClick={onStopAiVoiceResponse} disabled={!isAiSpeaking}>
            {t('coach:overlay.stopResponse')}
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
