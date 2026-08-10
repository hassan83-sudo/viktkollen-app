import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChatPanel from './ChatPanel.jsx'

describe('ChatPanel voice conversation status', () => {
  it('announces active conversation status and stop hint', () => {
    const markup = renderToStaticMarkup(
      <ChatPanel
        canClearChat={false}
        chatInput=""
        chatMessages={[]}
        chatThreadRef={{ current: null }}
        isListening
        isVoiceConversationActive
        messagesEndRef={{ current: null }}
        onChatInputChange={() => {}}
        onClearChat={() => {}}
        onSendChatMessage={() => {}}
        onStartVoiceInput={() => {}}
        onStarterPrompt={() => {}}
        starterPrompts={[]}
        voiceStatus="Lyssnar..."
      />,
    )

    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('Lyssnar...')
    expect(markup).toContain('Tryck för att avsluta')
  })
})
