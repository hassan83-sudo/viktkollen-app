import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function rootSource(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('Voice conversation app integration', () => {
  it('clears the chat input after submitting a voice transcript', () => {
    const source = rootSource('src/App.jsx')

    expect(source).toMatch(/setChatInput\(transcript\)\s+setChatInput\(''\)\s+return sendChatText\(transcript\)/)
  })

  it('returns the assistant reply so voice synthesis can read the existing AI answer', () => {
    const source = rootSource('src/App.jsx')

    expect(source).toContain('return result.reply')
    expect(source).toContain('return reply')
  })

  it('keeps manual text submission available while voice conversation is active', () => {
    const source = rootSource('src/App.jsx')

    expect(source).toContain('return sendChatText(transcript)')
    expect(source).toContain('function sendChatMessage(event)')
    expect(source).toContain('submitChatText(chatInput)')
  })

  it('persists the AI voice preference through the existing repository layer', () => {
    const source = rootSource('src/App.jsx')

    expect(source).toContain('getVoiceConversationSettings')
    expect(source).toContain('saveVoiceConversationSettings')
    expect(source).toContain('isSpeechEnabled: () => isAiVoiceEnabledRef.current')
  })
})
