import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ChatInput from './ChatInput.jsx'
import ChatMessageList from './ChatMessageList.jsx'
import AiCoachHeader from './aiCoach/AiCoachHeader.jsx'
import AiCoachHero from './aiCoach/AiCoachHero.jsx'
import AiCoachControls from './aiCoach/AiCoachControls.jsx'
import AiCoachSuggestions from './aiCoach/AiCoachSuggestions.jsx'
import { useDialogA11y } from '../services/accessibilityDialog.js'
import { getVoicePhaseLabel } from '../services/ai/realtimeVoiceController.js'
import {
  getCompanionVoiceProfile,
  getSelectedCompanionVoiceId,
  selectSpeechSynthesisVoice,
} from '../services/voiceConversationController.js'

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
  // A11Y-8C: focus in/trap/return, Escape, inert background and scroll lock.
  const dialogRef = useRef(null)
  useDialogA11y({ closeOnEscape: true, dialogRef, lockScroll: true, onClose })
  const overlay = typeof document === 'undefined' ? null : document.body
  const latestAssistantMessage = [...chatMessages].reverse().find((message) => message.role === 'assistant')
  const lastSpokenAssistantIdRef = useRef(latestAssistantMessage?.id ?? null)
  const [isTypedReplySpeaking, setIsTypedReplySpeaking] = useState(false)

  useEffect(() => {
    if (!isAiVoiceEnabled || isVoiceConversationActive || !latestAssistantMessage) return undefined
    if (lastSpokenAssistantIdRef.current === latestAssistantMessage.id) return undefined

    lastSpokenAssistantIdRef.current = latestAssistantMessage.id

    const speechSynthesis = window.speechSynthesis
    const SpeechSynthesisUtterance = window.SpeechSynthesisUtterance
    if (!speechSynthesis?.speak || !SpeechSynthesisUtterance) return undefined

    const utterance = new SpeechSynthesisUtterance(String(latestAssistantMessage.text || '').trim())
    if (!utterance.text) return undefined

    const avatarId = getSelectedCompanionVoiceId(window)
    const voiceProfile = getCompanionVoiceProfile(avatarId)
    const voice = selectSpeechSynthesisVoice(speechSynthesis.getVoices?.() || [], avatarId)
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang || 'sv-SE'
    utterance.rate = voiceProfile.rate
    utterance.pitch = voiceProfile.pitch

    const finish = () => setIsTypedReplySpeaking(false)
    utterance.onend = finish
    utterance.onerror = finish

    setIsTypedReplySpeaking(true)
    speechSynthesis.resume?.()
    speechSynthesis.speak(utterance)

    return () => {
      utterance.onend = null
      utterance.onerror = null
    }
  }, [isAiVoiceEnabled, isVoiceConversationActive, latestAssistantMessage])

  useEffect(
    () => () => {
      if (isTypedReplySpeaking) {
        window.speechSynthesis?.cancel?.()
      }
    },
    [isTypedReplySpeaking],
  )

  if (!overlay) return null

  const combinedAiSpeaking = isAiSpeaking || isTypedReplySpeaking
  const phaseLabel = getVoicePhaseLabel({
    isAiSpeaking: combinedAiSpeaking,
    isListening,
    isVoiceConversationActive,
    voiceStatus,
  })
  const engineStatus = chatEngineStatus || (latestAssistantMessage ? 'GPT-5.6 Luna · OpenAI aktiv' : '')

  function stopAiVoiceResponse() {
    window.speechSynthesis?.cancel?.()
    setIsTypedReplySpeaking(false)
    onStopAiVoiceResponse?.()
  }

  return createPortal(
    <div className="ai-coach-overlay" role="dialog" aria-labelledby="ai-coach-overlay-title" aria-modal="true" ref={dialogRef}>
      <AiCoachHeader onClose={onClose} />

      <AiCoachHero />

      <AiCoachControls
        canClearChat={canClearChat}
        isAiSpeaking={combinedAiSpeaking}
        isListening={isListening}
        isVoiceConversationActive={isVoiceConversationActive}
        isVoiceMuted={isVoiceMuted}
        onClearChat={onClearChat}
        onStartVoiceInput={onStartVoiceInput}
        onStopAiVoiceResponse={stopAiVoiceResponse}
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
          isAiSpeaking={combinedAiSpeaking}
          isAiVoiceEnabled={isAiVoiceEnabled}
          isListening={isListening}
          isVoiceConversationActive={isVoiceConversationActive}
          onAiVoiceEnabledChange={onAiVoiceEnabledChange}
          onChatInputChange={onChatInputChange}
          onSendChatMessage={onSendChatMessage}
          onStopAiVoiceResponse={stopAiVoiceResponse}
          onStartVoiceInput={onStartVoiceInput}
        />
        {engineStatus ? (
          <p className="chat-engine-status" aria-live="polite">
            {engineStatus}
          </p>
        ) : null}
      </div>
    </div>,
    overlay,
  )
}

export default AiCoachOverlay
