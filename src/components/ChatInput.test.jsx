import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChatInput from './ChatInput.jsx'

describe('ChatInput voice conversation UI', () => {
  it('renders a keyboard-native conversation stop control', () => {
    const markup = renderToStaticMarkup(
      <ChatInput
        chatInput=""
        isListening
        isVoiceConversationActive
        onChatInputChange={() => {}}
        onSendChatMessage={() => {}}
        onStartVoiceInput={() => {}}
      />,
    )

    expect(markup).toContain('type="button"')
    expect(markup).toContain('aria-label="Avsluta samtal"')
    expect(markup).toContain('Avsluta samtal')
    expect(markup).toContain('conversation-active')
  })

  it('keeps manual text input available when voice is unsupported', () => {
    const markup = renderToStaticMarkup(
      <ChatInput
        chatInput=""
        isListening={false}
        isVoiceConversationActive={false}
        onChatInputChange={() => {}}
        onSendChatMessage={() => {}}
        onStartVoiceInput={() => {}}
      />,
    )

    expect(markup).toContain('placeholder="Skriv en fråga..."')
    expect(markup).toContain('aria-label="Starta röstsamtal"')
  })
})
