/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import BodyAvatarTalkBar from './BodyAvatarTalkBar.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted = []

function renderTalkBar(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const callbacks = {
    onChatInputChange: vi.fn(),
    onSendChatMessage: vi.fn((event) => event.preventDefault()),
    onStartVoiceInput: vi.fn(),
    onStopAiVoiceResponse: vi.fn(),
    onToggleText: vi.fn(),
    onToggleVoiceMute: vi.fn(),
  }

  act(() => {
    root.render(<BodyAvatarTalkBar {...callbacks} {...props} />)
  })
  mounted.push({ container, root })
  return { callbacks, container }
}

afterEach(() => {
  mounted.splice(0).forEach(({ container, root }) => {
    act(() => root.unmount())
    container.remove()
  })
})

describe('BodyAvatarTalkBar', () => {
  it('renders a compact idle voice bar with one-tap voice and a separate text toggle', () => {
    const { callbacks, container } = renderTalkBar()
    const voiceBar = container.querySelector('.body-avatar-voice-bar')
    const talkButton = container.querySelector('[aria-label="Prata"]')
    const textButton = container.querySelector('.body-avatar-text-toggle')

    expect(voiceBar).not.toBeNull()
    expect(voiceBar.textContent).toContain('● Redo')
    expect(textButton.textContent).toContain('Text')
    expect(container.querySelector('.body-avatar-text-form')).toBeNull()

    act(() => talkButton.click())
    act(() => textButton.click())

    expect(callbacks.onStartVoiceInput).toHaveBeenCalledTimes(1)
    expect(callbacks.onToggleText).toHaveBeenCalledTimes(1)
  })

  it('keeps mute, interruption and end controls in active speaking state', () => {
    const { callbacks, container } = renderTalkBar({
      isAiSpeaking: true,
      isVoiceConversationActive: true,
    })

    const mute = container.querySelector('[aria-label="Mute"]')
    const interrupt = container.querySelector('[aria-label="Avbryt AI-svar"]')
    const stop = container.querySelector('[aria-label="Avsluta samtal"]')

    expect(container.textContent).toContain('🔊 AI pratar...')
    expect(mute).not.toBeNull()
    expect(interrupt).not.toBeNull()
    expect(stop).not.toBeNull()

    act(() => mute.click())
    act(() => interrupt.click())
    act(() => stop.click())

    expect(callbacks.onToggleVoiceMute).toHaveBeenCalledTimes(1)
    expect(callbacks.onStopAiVoiceResponse).toHaveBeenCalledTimes(1)
    expect(callbacks.onStartVoiceInput).toHaveBeenCalledTimes(1)
  })
})
