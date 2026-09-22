/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import AccessibilityHub from './AccessibilityHub.jsx'
import MoreHub from './MoreHub.jsx'

const appCss = readFileSync(resolve(process.cwd(), 'src', 'App.css'), 'utf8')

function renderCommunication() {
  return render(
    <MoreHub activeFolder="accessibility" onBack={vi.fn()}>
      <AccessibilityHub />
    </MoreHub>,
  )
}

function openCommunication() {
  fireEvent.click(screen.getByRole('button', { name: /^Tal & kommunikation/ }))
}

// A11Y-7D: focused coverage for the new symbol + text AAC-style tiles, on
// top of the existing AccessibilityCommunication.test.jsx suite (left
// untouched and still passing).
describe('AccessibilityCommunication AAC symbol tiles (A11Y-7D)', () => {
  let speechSynthesis

  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
    speechSynthesis = { cancel: vi.fn(), speak: vi.fn() }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: speechSynthesis,
    })
    globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text
    }
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    delete window.speechSynthesis
    delete globalThis.SpeechSynthesisUtterance
  })

  it('shows a symbol alongside the visible text for a phrase tile', () => {
    renderCommunication()
    openCommunication()

    const button = screen.getByRole('button', { name: 'Ja' })
    expect(button.textContent).toContain('✓')
    expect(button.textContent).toContain('Ja')
    expect(button.querySelector('.accessibility-phrase-symbol')).toBeTruthy()
    expect(button.querySelector('.accessibility-phrase-text').textContent).toBe('Ja')
  })

  it('never lets the symbol be the only accessible label (symbol is aria-hidden)', () => {
    renderCommunication()
    openCommunication()

    const button = screen.getByRole('button', { name: 'Ja' })
    const symbol = button.querySelector('.accessibility-phrase-symbol')
    expect(symbol.getAttribute('aria-hidden')).toBe('true')
    // The accessible name (used by getByRole above) is the visible text alone.
    expect(button.getAttribute('aria-label')).toBeNull()
  })

  it('is keyboard-activatable like every other phrase button', () => {
    renderCommunication()
    openCommunication()

    const button = screen.getByRole('button', { name: 'Tack' })
    button.focus()
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Tack')
  })

  it('keeps the existing 52px+ touch target foundation for phrase tiles', () => {
    expect(appCss).toContain('min-height: 52px;')
    expect(appCss).toContain('.accessibility-phrase-symbol')
    expect(appCss).toContain('.accessibility-phrase-text')
  })

  it('Ja / Nej / Tack all work', () => {
    renderCommunication()
    openCommunication()
    const editor = screen.getByRole('textbox', { name: 'Säg detta åt mig' })

    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    expect(editor.value).toBe('Ja')
    fireEvent.click(screen.getByRole('button', { name: 'Nej' }))
    expect(editor.value).toBe('Nej')
    fireEvent.click(screen.getByRole('button', { name: 'Tack' }))
    expect(editor.value).toBe('Tack')
  })

  it('hungry / thirsty / toilet all work', () => {
    renderCommunication()
    openCommunication()
    const editor = screen.getByRole('textbox', { name: 'Säg detta åt mig' })

    fireEvent.click(screen.getByRole('button', { name: 'Jag är hungrig' }))
    expect(editor.value).toBe('Jag är hungrig')
    fireEvent.click(screen.getByRole('button', { name: 'Jag är törstig' }))
    expect(editor.value).toBe('Jag är törstig')
    fireEvent.click(screen.getByRole('button', { name: 'Jag behöver gå på toaletten' }))
    expect(editor.value).toBe('Jag behöver gå på toaletten')
  })

  it('help / contact / cannot-speak-now all work', () => {
    renderCommunication()
    openCommunication()
    const editor = screen.getByRole('textbox', { name: 'Säg detta åt mig' })

    fireEvent.click(screen.getByRole('button', { name: 'Hjälp mig' }))
    expect(editor.value).toBe('Hjälp mig')
    fireEvent.click(screen.getByRole('button', { name: 'Jag behöver hjälp' }))
    expect(editor.value).toBe('Jag behöver hjälp')
    fireEvent.click(screen.getByRole('button', { name: 'Ring min kontakt' }))
    expect(editor.value).toBe('Ring min kontakt')
    fireEvent.click(screen.getByRole('button', { name: 'Jag kan inte prata just nu' }))
    expect(editor.value).toBe('Jag kan inte prata just nu')
  })

  it('pain works', () => {
    renderCommunication()
    openCommunication()
    fireEvent.click(screen.getByRole('button', { name: 'Jag har ont' }))
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Jag har ont')
  })

  it('tired is a new phrase and works', () => {
    renderCommunication()
    openCommunication()
    fireEvent.click(screen.getByRole('button', { name: 'Jag är trött' }))
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Jag är trött')
  })

  it('want-to-go-home is a new phrase and works', () => {
    renderCommunication()
    openCommunication()
    fireEvent.click(screen.getByRole('button', { name: 'Jag vill gå hem' }))
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Jag vill gå hem')
  })

  it('dont-understand / write-instead / repeat all work', () => {
    renderCommunication()
    openCommunication()
    const editor = screen.getByRole('textbox', { name: 'Säg detta åt mig' })

    fireEvent.click(screen.getByRole('button', { name: 'Jag förstår inte' }))
    expect(editor.value).toBe('Jag förstår inte')
    fireEvent.click(screen.getByRole('button', { name: 'Skriv istället' }))
    expect(editor.value).toBe('Skriv istället')
    fireEvent.click(screen.getByRole('button', { name: 'Kan du upprepa?' }))
    expect(editor.value).toBe('Kan du upprepa?')
  })

  it('does not auto-speak merely because a phrase tile was selected', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Jag är trött' }))
    expect(speechSynthesis.speak).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Jag vill gå hem' }))
    expect(speechSynthesis.speak).not.toHaveBeenCalled()
  })

  it('explicit Säg detta (speak) still works for the new phrases', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Jag är trött' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(speechSynthesis.speak.mock.calls[0][0].text).toBe('Jag är trött')
  })

  it('Stoppa (stop) still works after selecting a new phrase', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Jag vill gå hem' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa' }))

    expect(speechSynthesis.cancel).toHaveBeenCalled()
  })

  it('large-message mode still works for the new phrases, text-dominant', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Jag är trött' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visa stort' }))

    const largeText = screen.getByLabelText('Stor text')
    expect(largeText.textContent).toContain('Jag är trött')
  })

  it('custom free text still works alongside the phrase tiles', () => {
    renderCommunication()
    openCommunication()

    fireEvent.change(screen.getByRole('textbox', { name: 'Säg detta åt mig' }), {
      target: { value: 'En egen text' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

    expect(speechSynthesis.speak.mock.calls[0][0].text).toBe('En egen text')
  })

  it('gives every phrase tile a meaningful, non-empty screen-reader name', () => {
    renderCommunication()
    openCommunication()

    screen.getAllByRole('button').forEach((button) => {
      const name = button.getAttribute('aria-label') || button.textContent.trim()
      expect(name).not.toBe('')
    })
  })

  it('stays usable with high contrast enabled', () => {
    window.localStorage.setItem('viktkollen.accessibility.preferences.v1', JSON.stringify({ highContrast: true }))
    renderCommunication()
    openCommunication()

    const button = screen.getByRole('button', { name: 'Jag är trött' })
    expect(button).toBeTruthy()
    fireEvent.click(button)
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Jag är trött')
  })

  it('stays usable with large text enabled', () => {
    window.localStorage.setItem('viktkollen.accessibility.preferences.v1', JSON.stringify({ textSize: 'extra-large' }))
    renderCommunication()
    openCommunication()

    const button = screen.getByRole('button', { name: 'Jag vill gå hem' })
    expect(button).toBeTruthy()
    fireEvent.click(button)
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Jag vill gå hem')
  })

  it('keeps a one-column collapse foundation at 390px/430px for the phrase grid', () => {
    expect(appCss).toContain('@media (max-width: 430px)')
    expect(appCss).toContain('.accessibility-phrase-grid')
  })

  it('causes no network request when selecting, speaking, or stopping a phrase', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no network call expected')
    })
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Jag är trött' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa' }))

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('never stores selected or custom communication text anywhere in localStorage', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Jag har ont' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Säg detta åt mig' }), {
      target: { value: 'Ett hemligt meddelande' },
    })

    Object.keys(window.localStorage).forEach((key) => {
      const value = window.localStorage.getItem(key)
      expect(value).not.toContain('Jag har ont')
      expect(value).not.toContain('Ett hemligt meddelande')
    })
  })
})
