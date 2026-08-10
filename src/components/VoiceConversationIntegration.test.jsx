import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function rootSource(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('Voice conversation app integration', () => {
  it('clears the chat input after submitting a voice transcript', () => {
    const source = rootSource('src/App.jsx')

    expect(source).toMatch(/setChatInput\(transcript\)\s+setChatInput\(''\)\s+await sendChatText\(transcript\)/)
  })

  it('keeps manual text submission available while voice conversation is active', () => {
    const source = rootSource('src/App.jsx')

    expect(source).toContain('await sendChatText(transcript)')
    expect(source).toContain('function sendChatMessage(event)')
    expect(source).toContain('submitChatText(chatInput)')
  })
})
