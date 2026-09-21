/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import GlobalSearch from './GlobalSearch.jsx'

class MockSpeechRecognition {
  static instances = []

  constructor() {
    this.lang = ''
    this.interimResults = false
    this.continuous = false
    this.maxAlternatives = 1
    this.onstart = null
    this.onresult = null
    this.onerror = null
    this.onend = null
    this.abort = vi.fn(() => {
      this.onerror?.({ error: 'aborted' })
      this.onend?.()
    })
    this.stop = vi.fn(() => this.onend?.())
    this.start = vi.fn(() => this.onstart?.())
    MockSpeechRecognition.instances.push(this)
  }

  emitFinal(transcript) {
    const result = {
      0: { transcript },
      isFinal: true,
      length: 1,
    }
    this.onresult?.({ results: { 0: result, length: 1 } })
    this.onend?.()
  }

  emitError(error) {
    this.onerror?.({ error })
    this.onend?.()
  }
}

function renderHostAndTrigger(onNavigate = vi.fn()) {
  render(
    <>
      <GlobalSearch />
      <GlobalSearch listenForShortcut onNavigate={onNavigate} showTrigger={false} />
    </>,
  )
  return onNavigate
}

describe('GlobalSearch voice', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
    MockSpeechRecognition.instances = []
    window.SpeechRecognition = MockSpeechRecognition
    delete window.webkitSpeechRecognition
  })

  afterEach(() => {
    cleanup()
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
  })

  it('fills GlobalSearch from a Swedish transcript without auto-navigation', async () => {
    const onNavigate = renderHostAndTrigger()
    fireEvent.click(screen.getAllByRole('button', { name: 'Röstsök' })[0])

    await waitFor(() => {
      expect(screen.getByText('Lyssnar…')).toBeTruthy()
    })
    expect(MockSpeechRecognition.instances).toHaveLength(1)
    expect(MockSpeechRecognition.instances[0].lang).toBe('sv-SE')

    act(() => {
      MockSpeechRecognition.instances[0].emitFinal('Matscanning')
    })

    expect(screen.getByRole('dialog', { name: 'Global sökning' })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Sök i Viktkollen' }).value).toBe('Matscanning')
    expect(screen.getByRole('option', { name: /Matscanning/i })).toBeTruthy()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('uses webkitSpeechRecognition when the standard API is missing', async () => {
    delete window.SpeechRecognition
    window.webkitSpeechRecognition = MockSpeechRecognition
    renderHostAndTrigger()
    fireEvent.click(screen.getAllByRole('button', { name: 'Röstsök' })[0])
    await waitFor(() => {
      expect(MockSpeechRecognition.instances).toHaveLength(1)
    })
    act(() => {
      MockSpeechRecognition.instances[0].emitFinal('Min resa')
    })
    expect(screen.getByRole('searchbox', { name: 'Sök i Viktkollen' }).value).toBe('Min resa')
    expect(screen.getByRole('option', { name: /Min resa/i })).toBeTruthy()
  })

  it('shows an unsupported message and keeps typed search working', async () => {
    delete window.SpeechRecognition
    const onNavigate = renderHostAndTrigger()
    fireEvent.click(screen.getAllByRole('button', { name: 'Röstsök' })[0])
    expect(screen.getByText(/Röstsök stöds inte/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Öppna global sökning' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Sök i Viktkollen' }), { target: { value: 'Inkasso' } })
    fireEvent.click(screen.getByRole('option', { name: /Inkasso/i }))
    expect(onNavigate).toHaveBeenCalled()
  })

  it('explains permission denied and no-speech without crashing', async () => {
    renderHostAndTrigger()
    fireEvent.click(screen.getAllByRole('button', { name: 'Röstsök' })[0])
    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(1))
    act(() => {
      MockSpeechRecognition.instances[0].emitError('not-allowed')
    })
    expect(screen.getByText(/Mikrofonåtkomst nekades/)).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Röstsök' })[0])
    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(2))
    act(() => {
      MockSpeechRecognition.instances[1].emitError('no-speech')
    })
    expect(screen.getByText(/Ingen röst hördes/)).toBeTruthy()
  })

  it('aborts the active session and ignores a stale transcript', async () => {
    const onNavigate = renderHostAndTrigger()
    fireEvent.click(screen.getAllByRole('button', { name: 'Röstsök' })[0])
    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(1))
    const first = MockSpeechRecognition.instances[0]
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(first.abort).toHaveBeenCalled()
    expect(screen.getByText('Röstsök stoppad')).toBeTruthy()
    act(() => {
      first.emitFinal('Plats')
    })
    expect(screen.getByRole('searchbox', { name: 'Sök i Viktkollen' }).value).toBe('')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('does not start two recognition sessions from rapid microphone presses', async () => {
    renderHostAndTrigger()
    const mic = screen.getAllByRole('button', { name: 'Röstsök' })[0]
    fireEvent.click(mic)
    fireEvent.click(mic)
    await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(0))
    expect(MockSpeechRecognition.instances).toHaveLength(1)
    expect(MockSpeechRecognition.instances[0].abort).toHaveBeenCalled()
  })

  it('aborts recognition on unmount', async () => {
    const { unmount } = render(<GlobalSearch listenForShortcut onNavigate={() => {}} showTrigger={false} />)
    window.dispatchEvent(new CustomEvent('viktkollen:start-global-search-voice'))
    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(1))
    const active = MockSpeechRecognition.instances[0]
    unmount()
    expect(active.abort).toHaveBeenCalled()
  })

  it('keeps Swedish destinations in the same search index without auto-navigation', async () => {
    const onNavigate = renderHostAndTrigger()

    for (const phrase of ['Min resa', 'Inkasso', 'AI Ögat', 'Plats']) {
      fireEvent.click(screen.getAllByRole('button', { name: 'Röstsök' })[0])
      await waitFor(() => expect(MockSpeechRecognition.instances.at(-1)?.start).toHaveBeenCalled())
      act(() => {
        MockSpeechRecognition.instances.at(-1).emitFinal(phrase)
      })
      expect(screen.getByRole('searchbox', { name: 'Sök i Viktkollen' }).value).toBe(phrase)
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
      expect(onNavigate).not.toHaveBeenCalled()
    }
  })
})
