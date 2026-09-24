/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { saveAccessibilityPreferences } from '../../services/accessibilityPreferences.js'
import {
  communicationPhrasesKey,
  maxCommunicationPhrases,
} from '../../services/accessibilityCommunicationPhrases.js'
import AccessibilityHub from './AccessibilityHub.jsx'
import MoreHub from './MoreHub.jsx'

function renderCommunication() {
  render(
    <MoreHub activeFolder="accessibility" onBack={vi.fn()}>
      <AccessibilityHub />
    </MoreHub>,
  )
  fireEvent.click(screen.getByRole('button', { name: /^Tal & kommunikation/ }))
}

function communicationRegion() {
  return screen.getByRole('region', { name: 'Tal och kommunikation' })
}

function typeMessage(text) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Säg detta åt mig' }), { target: { value: text } })
}

function openGuidance() {
  const guidance = screen.getByText('Så använder du stödet').closest('details')
  if (!guidance.open) fireEvent.click(screen.getByText('Så använder du stödet'))
}

function savePhraseViaUi(text) {
  fireEvent.change(screen.getByLabelText('Skriv en egen fras'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Spara fras' }))
}

const longMessage = 'Jag behöver hjälp med att hitta rätt dörr till mottagningen. Kan du visa mig vägen dit och vänta med mig en stund? Jag har svårt att prata men hör allt ni säger till mig, tack så mycket.'

// A11Y-8A: hardening of the communication support (read-aloud, speech rate,
// live status, focus and the saved-phrase limit).
describe('AccessibilityCommunication hardening (A11Y-8A)', () => {
  let speechSynthesis

  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
    speechSynthesis = { cancel: vi.fn(), speak: vi.fn() }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speechSynthesis })
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

  const spokenText = () => speechSynthesis.speak.mock.calls.map(([utterance]) => utterance.text)
  const lastUtterance = () => speechSynthesis.speak.mock.calls.at(-1)[0]

  describe('long read-aloud', () => {
    it('reads a message over 160 characters completely and only then reports it as complete', () => {
      renderCommunication()
      typeMessage(longMessage)
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

      expect(screen.getByText('Läser upp').closest('[role="status"]')).toBeTruthy()
      act(() => lastUtterance().onend())
      expect(screen.queryByText('Uppläsningen är klar. Texten finns kvar.')).toBeNull()
      expect(screen.getByRole('button', { name: 'Stoppa' })).toBeTruthy()

      for (let guard = 0; guard < 10 && spokenText().join(' ').length < longMessage.length; guard += 1) {
        act(() => lastUtterance().onend())
      }
      expect(screen.queryByText('Uppläsningen är klar. Texten finns kvar.')).toBeNull()
      act(() => lastUtterance().onend())

      expect(spokenText().join(' ')).toBe(longMessage)
      expect(screen.getByText('Uppläsningen är klar. Texten finns kvar.').closest('[role="status"]')).toBeTruthy()
    })

    it('reads a message at the 280-character field limit completely', () => {
      renderCommunication()
      const textarea = screen.getByRole('textbox', { name: 'Säg detta åt mig' })
      expect(textarea.getAttribute('maxlength')).toBe('280')
      const maxMessage = `${'Ring min kontakt nu '.repeat(14)}`.slice(0, 280)
      expect(maxMessage.length).toBe(280)
      typeMessage(maxMessage)

      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      for (let guard = 0; guard < 10 && !screen.queryByText('Uppläsningen är klar. Texten finns kvar.'); guard += 1) {
        act(() => lastUtterance().onend())
      }

      expect(spokenText().join(' ')).toBe(maxMessage.trim())
      spokenText().forEach((segment) => expect(segment.length).toBeLessThanOrEqual(160))
    })

    it('stops a long read-aloud completely with Stoppa', () => {
      renderCommunication()
      typeMessage(longMessage)
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      const firstSegment = lastUtterance()

      fireEvent.click(screen.getByRole('button', { name: 'Stoppa' }))
      act(() => firstSegment.onend())

      expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Uppläsningen stoppades. Texten finns kvar.').closest('[role="status"]')).toBeTruthy()
      expect(screen.queryByText('Uppläsningen är klar. Texten finns kvar.')).toBeNull()
    })

    it('lets a new read-aloud replace a long one and ignores the old callbacks', () => {
      renderCommunication()
      typeMessage(longMessage)
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      const oldSegment = lastUtterance()

      fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      act(() => oldSegment.onend())

      expect(spokenText().at(-1)).toBe('Ja')
      expect(speechSynthesis.speak).toHaveBeenCalledTimes(2)
      expect(screen.getByText('Läser upp').closest('[role="status"]')).toBeTruthy()

      act(() => lastUtterance().onend())
      expect(screen.getByText('Uppläsningen är klar. Texten finns kvar.').closest('[role="status"]')).toBeTruthy()
    })
  })

  describe('speech rate', () => {
    it.each([
      ['slow', 0.8],
      ['normal', 1],
      ['fast', 1.2],
    ])('uses the chosen %s accessibility speech rate for manual read-aloud', (rate, expected) => {
      saveAccessibilityPreferences({ navigationSpeechRate: rate })
      renderCommunication()
      fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

      expect(lastUtterance().rate).toBe(expected)
    })

    it('follows a rate change made while the communication view is open', () => {
      renderCommunication()
      act(() => {
        saveAccessibilityPreferences({ navigationSpeechRate: 'slow' })
      })
      openGuidance()
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp hjälp' }))

      expect(lastUtterance().rate).toBe(0.8)
    })
  })

  describe('status live region', () => {
    it('keeps the speech status region mounted before the first message', () => {
      renderCommunication()
      const regions = within(communicationRegion()).getAllByRole('status')

      expect(regions.length).toBeGreaterThanOrEqual(2)
      regions.forEach((region) => {
        expect(region.textContent).toBe('')
        expect(region.getAttribute('aria-live')).toBe('polite')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      const speaking = screen.getByText('Läser upp').closest('[role="status"]')
      expect(regions).toContain(speaking)
    })

    it('replaces the old message in the same region without re-announcing a repeated speaking status', () => {
      renderCommunication()
      fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      const region = screen.getByText('Läser upp').closest('[role="status"]')
      const speakingNode = region.firstChild

      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      expect(region.firstChild).toBe(speakingNode)

      fireEvent.click(screen.getByRole('button', { name: 'Stoppa' }))
      expect(region.textContent).toBe('Uppläsningen stoppades. Texten finns kvar.')
      expect(within(communicationRegion()).getAllByRole('status').filter((status) => status.textContent)).toHaveLength(1)
    })

    it('re-announces the same fallback when the user tries again without browser speech', () => {
      delete window.speechSynthesis
      delete globalThis.SpeechSynthesisUtterance
      renderCommunication()
      fireEvent.click(screen.getByRole('button', { name: 'Ja' }))

      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      const message = 'Uppläsning stöds inte på den här enheten. Visa och läs texten i stället.'
      const region = screen.getByText(message).closest('[role="status"]')
      const firstNode = region.firstChild

      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      expect(region.textContent).toBe(message)
      expect(region.firstChild).not.toBe(firstNode)
    })

    it('re-announces the saved status for every saved phrase', () => {
      renderCommunication()
      savePhraseViaUi('Jag vill ha kaffe')
      const region = screen.getByText('Frasen sparades.').closest('[role="status"]')
      const firstNode = region.firstChild

      savePhraseViaUi('Jag vill ha te')
      expect(region.textContent).toBe('Frasen sparades.')
      expect(region.firstChild).not.toBe(firstNode)
    })
  })

  describe('focus', () => {
    it('keeps focus in the text field when typing while the large view is open', () => {
      renderCommunication()
      typeMessage('Jag vill ha vatten')
      fireEvent.click(screen.getByRole('button', { name: 'Visa stort' }))
      const textarea = screen.getByRole('textbox', { name: 'Säg detta åt mig' })

      textarea.focus()
      fireEvent.change(textarea, { target: { value: 'Jag vill ha vatten nu' } })

      expect(screen.queryByLabelText('Stor text')).toBeNull()
      expect(document.activeElement).toBe(textarea)
    })

    it('keeps focus in the text field when Escape closes the large view while typing there', () => {
      renderCommunication()
      typeMessage('Jag vill ha vatten')
      fireEvent.click(screen.getByRole('button', { name: 'Visa stort' }))
      const textarea = screen.getByRole('textbox', { name: 'Säg detta åt mig' })
      textarea.focus()

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(screen.queryByLabelText('Stor text')).toBeNull()
      expect(document.activeElement).toBe(textarea)
    })

    it('still returns focus to Visa stort after Escape from inside the large view', () => {
      renderCommunication()
      typeMessage('Jag vill ha vatten')
      const trigger = screen.getByRole('button', { name: 'Visa stort' })
      fireEvent.click(trigger)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stäng stor text' }))

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(document.activeElement).toBe(trigger)
    })

    it('moves focus to Ångra rensning, not body, when clearing with the large view open', () => {
      renderCommunication()
      typeMessage('Jag vill ha vatten')
      fireEvent.click(screen.getByRole('button', { name: 'Visa stort' }))

      fireEvent.click(screen.getByRole('button', { name: 'Rensa' }))

      expect(screen.queryByLabelText('Stor text')).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ångra rensning' }))
      expect(document.activeElement).not.toBe(document.body)

      fireEvent.click(screen.getByRole('button', { name: 'Ångra rensning' }))
      const textarea = screen.getByRole('textbox', { name: 'Säg detta åt mig' })
      expect(textarea.value).toBe('Jag vill ha vatten')
      expect(document.activeElement).toBe(textarea)
    })

    it('focuses the safe choice in the delete confirmation and supports Escape', () => {
      renderCommunication()
      savePhraseViaUi('Jag vill ha kaffe')

      fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))
      const confirmation = screen.getByRole('group', { name: 'Vill du ta bort frasen "Jag vill ha kaffe"?' })
      expect(document.activeElement).toBe(within(confirmation).getByRole('button', { name: 'Avbryt' }))

      fireEvent.keyDown(document.activeElement, { key: 'Escape' })

      expect(screen.queryByRole('group', { name: 'Vill du ta bort frasen "Jag vill ha kaffe"?' })).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))
      expect(window.localStorage.getItem(communicationPhrasesKey)).toContain('Jag vill ha kaffe')
    })

    it('returns focus to the delete button after Avbryt', () => {
      renderCommunication()
      savePhraseViaUi('Jag vill ha kaffe')
      fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))

      fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))
    })

    it('moves focus to Undo after a confirmed delete, and to the restored phrase after Undo', () => {
      renderCommunication()
      savePhraseViaUi('Jag vill ha kaffe')
      fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))

      fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
      const undo = screen.getByRole('button', { name: 'Ångra borttagning av "Jag vill ha kaffe"' })
      expect(document.activeElement).toBe(undo)

      fireEvent.click(undo)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Jag vill ha kaffe' }))
    })
  })

  describe('saved phrase limit', () => {
    function fillToLimit() {
      const phrases = Array.from({ length: maxCommunicationPhrases }, (_, index) => ({
        createdAt: '2026-01-01T00:00:00.000Z',
        id: `phrase-${index}`,
        text: `Fras nummer ${index + 1}`,
      }))
      window.localStorage.setItem(communicationPhrasesKey, JSON.stringify(phrases))
    }

    it('explains the limit next to the field instead of silently disabling Spara', () => {
      fillToLimit()
      renderCommunication()

      const save = screen.getByRole('button', { name: 'Spara fras' })
      const input = screen.getByLabelText('Skriv en egen fras')
      const hint = screen.getByText('Du har sparat max antal fraser (20). Ta bort en fras för att spara en ny.')

      expect(save.hasAttribute('disabled')).toBe(false)
      expect(input.getAttribute('aria-describedby')).toBe(hint.id)
    })

    it('announces the limit as an error tied to the field when saving at the limit', () => {
      fillToLimit()
      renderCommunication()

      savePhraseViaUi('En fras till')

      const input = screen.getByLabelText('Skriv en egen fras')
      const status = screen.getAllByRole('status').find((region) => region.textContent === 'Du har sparat max antal fraser (20). Ta bort en fras för att spara en ny.')
      expect(status).toBeTruthy()
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(input.getAttribute('aria-describedby')).toBe(status.id)
      expect(JSON.parse(window.localStorage.getItem(communicationPhrasesKey))).toHaveLength(maxCommunicationPhrases)
    })

    it('shows no limit hint below the limit', () => {
      renderCommunication()
      expect(screen.queryByText('Du har sparat max antal fraser (20). Ta bort en fras för att spara en ny.')).toBeNull()
      expect(screen.getByLabelText('Skriv en egen fras').getAttribute('aria-describedby')).toBeNull()
    })
  })
})
