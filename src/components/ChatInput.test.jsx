import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChatInput from './ChatInput.jsx'

describe('ChatInput voice conversation UI', () => {
  it('renders a keyboard-native conversation stop control and AI voice controls', () => {
    const markup = renderToStaticMarkup(
      <ChatInput
        chatInput=""
        isAiSpeaking
        isAiVoiceEnabled
        isListening
        isVoiceConversationActive
        onAiVoiceEnabledChange={() => {}}
        onChatInputChange={() => {}}
        onSendChatMessage={() => {}}
        onStopAiVoiceResponse={() => {}}
        onStartVoiceInput={() => {}}
      />,
    )

    expect(markup).toContain('type="button"')
    expect(markup).toContain('aria-label="Avsluta samtal"')
    expect(markup).toContain('Avsluta samtal')
    expect(markup).toContain('AI-röst')
    expect(markup).toContain('Avbryt svar')
    expect(markup).toContain('voice-conversation-active')
    expect(markup).toContain('conversation-active')
  })

  it('keeps manual text input available when voice is unsupported', () => {
    const markup = renderToStaticMarkup(
      <ChatInput
        chatInput=""
        isAiSpeaking={false}
        isAiVoiceEnabled={false}
        isListening={false}
        isVoiceConversationActive={false}
        onAiVoiceEnabledChange={() => {}}
        onChatInputChange={() => {}}
        onSendChatMessage={() => {}}
        onStopAiVoiceResponse={() => {}}
        onStartVoiceInput={() => {}}
      />,
    )

    expect(markup).toContain('placeholder="Skriv en fråga..."')
    expect(markup).toContain('aria-label="Starta röstsamtal"')
    expect(markup).not.toContain('AI-röst')
  })
})
