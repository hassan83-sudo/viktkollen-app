/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
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

describe('AccessibilityCommunication', () => {
  let speechSynthesis

  beforeEach(async () => {
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
    delete window.speechSynthesis
    delete globalThis.SpeechSynthesisUtterance
  })

  function openCommunication() {
    fireEvent.click(screen.getByRole('button', { name: /^Tal & kommunikation/ }))
  }

  it('opens grouped preset phrases and shows the selected phrase controls', () => {
    renderCommunication()
    openCommunication()

    ;['Grundläggande', 'Behov', 'Hjälp', 'Mående', 'Kommunikation'].forEach((group) => {
      expect(screen.getByRole('heading', { name: group })).toBeTruthy()
    })
    ;['Ja', 'Nej', 'Tack', 'Vänta', 'Hjälp mig', 'Jag behöver hjälp', 'Jag förstår inte', 'Skriv istället', 'Kan du upprepa?', 'Jag behöver en paus', 'Jag har ont', 'Jag är hungrig', 'Jag är törstig', 'Jag behöver gå på toaletten', 'Ring min kontakt', 'Jag kan inte prata just nu'].forEach((phrase) => {
      expect(screen.getByRole('button', { name: phrase })).toBeTruthy()
    })

    const phrase = screen.getByRole('button', { name: 'Hjälp mig' })
    phrase.focus()
    expect(document.activeElement).toBe(phrase)

    fireEvent.click(phrase)

    expect(screen.getByText('Hjälp mig', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Hjälp mig')
    expect(speechSynthesis.speak).not.toHaveBeenCalled()
    ;['Läs upp', 'Visa stort', 'Rensa'].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    })
  })

  it('reads a selected phrase locally and stops before selecting another phrase', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(speechSynthesis.speak.mock.calls[0][0].text).toBe('Ja')
    expect(speechSynthesis.speak.mock.calls[0][0].lang).toBe('sv-SE')
    expect(screen.getByRole('button', { name: 'Stoppa' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Nej' }))

    expect(speechSynthesis.cancel).toHaveBeenCalled()
    expect(screen.getByText('Nej', { selector: 'strong' })).toBeTruthy()
  })

  it('shows a visible status message when speech starts and stops', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

    expect(screen.getByText('Uppläsningen startade').closest('[role="status"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Stoppa' }))

    expect(screen.getByText('Uppläsningen stoppades').closest('[role="status"]')).toBeTruthy()
  })

  it('stops active speech explicitly and when leaving the communication detail', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Tack' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa' }))

    expect(speechSynthesis.cancel).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
    const cancelCallsBeforeLeaving = speechSynthesis.cancel.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))

    expect(speechSynthesis.cancel.mock.calls.length).toBeGreaterThan(cancelCallsBeforeLeaving)
  })

  it('supports custom text, large text and a local undo after clearing', () => {
    renderCommunication()
    openCommunication()

    fireEvent.change(screen.getByRole('textbox', { name: 'Säg detta åt mig' }), {
      target: { value: 'Jag vill ha vatten' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
    expect(speechSynthesis.speak.mock.calls[0][0].text).toBe('Jag vill ha vatten')

    fireEvent.click(screen.getByRole('button', { name: 'Visa stort' }))
    expect(screen.getByLabelText('Stor text').textContent).toContain('Jag vill ha vatten')

    fireEvent.click(screen.getByRole('button', { name: 'Stäng stor text' }))
    expect(screen.queryByLabelText('Stor text')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Visa stort' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByLabelText('Stor text')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Rensa' }))
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Läs upp' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ångra rensning' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ångra rensning' }))
    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Jag vill ha vatten')
  })

  it('shows the exact fallback without crashing when browser speech is unsupported', () => {
    delete window.speechSynthesis
    delete globalThis.SpeechSynthesisUtterance
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

    expect(screen.getByText('Uppläsning stöds inte på den här enheten.').closest('[role="status"]')).toBeTruthy()
    expect(screen.getByText('Ja', { selector: 'strong' })).toBeTruthy()
  })

  it('keeps AI writing and favorites planned only', () => {
    renderCommunication()
    openCommunication()

    expect(screen.getByText('Kommer senare. Ingen AI-anslutning används här.')).toBeTruthy()
    expect(screen.getByText('Kommer senare. Favoriter sparas inte i den här versionen.')).toBeTruthy()
  })

  it('keeps message text local, returns focus from large message mode, and never dials a contact phrase', () => {
    renderCommunication()
    openCommunication()
    const editor = screen.getByRole('textbox', { name: 'Säg detta åt mig' })

    fireEvent.click(screen.getByRole('button', { name: 'Ring min kontakt' }))
    expect(editor.value).toBe('Ring min kontakt')
    expect(speechSynthesis.speak).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('viktkollen.accessibility.preferences.v1')).toBeNull()

    const largeButton = screen.getByRole('button', { name: 'Visa stort' })
    fireEvent.click(largeButton)
    expect(screen.getByLabelText('Stor text').textContent).toContain('Ring min kontakt')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stäng stor text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stäng stor text' }))
    expect(document.activeElement).toBe(largeButton)
  })

  it('keeps communication controls keyboard-reachable with scoped target size and spacing', () => {
    renderCommunication()
    openCommunication()

    const phrase = screen.getByRole('button', { name: 'Ja' })
    const back = screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ })
    expect(phrase.tagName).toBe('BUTTON')
    expect(back.tagName).toBe('BUTTON')
    expect(phrase.getAttribute('tabindex')).toBeNull()
    expect(back.getAttribute('tabindex')).toBeNull()
    expect(appCss).toMatch(/\.accessibility-hub button,\s*\.accessibility-detail button/)
    expect(appCss).toContain('min-height: 44px;')
    expect(appCss).toMatch(/\.accessibility-phrase-button\s*\{\s*min-width: 0;\s*min-height: 52px;/)
    expect(appCss).toMatch(/\.accessibility-communication-actions\s*\{\s*display: flex;\s*flex-wrap: wrap;\s*gap: 12px;/)
  })
})
