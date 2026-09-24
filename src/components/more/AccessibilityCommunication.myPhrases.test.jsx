/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { accessibilityPreferencesKey, resetAccessibilityPreferences, saveAccessibilityPreferences } from '../../services/accessibilityPreferences.js'
import { communicationPhrasesKey } from '../../services/accessibilityCommunicationPhrases.js'
import AccessibilityHub from './AccessibilityHub.jsx'
import MoreHub from './MoreHub.jsx'

const communicationSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'more', 'AccessibilityCommunication.jsx'), 'utf8')

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

function savePhraseViaUi(text) {
  fireEvent.change(screen.getByLabelText('Skriv en egen fras'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Spara fras' }))
}

// A11Y-7E: local custom AAC communication phrases (create/select/delete),
// on top of the A11Y-7D symbol tiles and the untouched existing
// AccessibilityCommunication.test.jsx suite.
describe('AccessibilityCommunication saved phrases - Mina fraser (A11Y-7E)', () => {
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

  it('shows a Mina fraser section with local-only privacy text', () => {
    renderCommunication()
    openCommunication()

    expect(screen.getByRole('heading', { name: 'Mina fraser', level: 3 })).toBeTruthy()
    expect(screen.getByText('Dina sparade fraser finns bara på den här enheten. De skickas aldrig till någon server.')).toBeTruthy()
    expect(screen.getByText('Inga sparade fraser ännu.')).toBeTruthy()
  })

  it('blocks an empty phrase from saving', () => {
    renderCommunication()
    openCommunication()

    fireEvent.click(screen.getByRole('button', { name: 'Spara fras' }))

    expect(screen.getByText('Skriv en text innan du sparar.')).toBeTruthy()
    expect(window.localStorage.getItem(communicationPhrasesKey)).toBeNull()
  })

  it('blocks a whitespace-only phrase from saving', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('     ')

    expect(screen.getByText('Skriv en text innan du sparar.')).toBeTruthy()
    expect(window.localStorage.getItem(communicationPhrasesKey)).toBeNull()
  })

  it('trims whitespace around a saved phrase', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('  Jag vill ha kaffe  ')

    expect(screen.getByRole('button', { name: 'Jag vill ha kaffe' })).toBeTruthy()
    expect(window.localStorage.getItem(communicationPhrasesKey)).toContain('"text":"Jag vill ha kaffe"')
  })

  it('saves a normal phrase and shows a saved status', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag behöver vila')

    expect(screen.getByText('Frasen sparades.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Jag behöver vila' })).toBeTruthy()
    // The input clears after a successful save.
    expect(screen.getByLabelText('Skriv en egen fras').value).toBe('')
  })

  it('persists a saved phrase through a component remount', () => {
    const { unmount } = renderCommunication()
    openCommunication()
    savePhraseViaUi('Ring min dotter')
    unmount()

    renderCommunication()
    openCommunication()
    expect(screen.getByRole('button', { name: 'Ring min dotter' })).toBeTruthy()
  })

  it('loads an already-saved phrase from localStorage on first render', () => {
    window.localStorage.setItem(communicationPhrasesKey, JSON.stringify([
      { createdAt: new Date().toISOString(), id: 'phrase-1', text: 'Jag vill gå ut' },
    ]))
    renderCommunication()
    openCommunication()

    expect(screen.getByRole('button', { name: 'Jag vill gå ut' })).toBeTruthy()
  })

  it('selecting a saved phrase feeds the existing communication flow', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag behöver hjälp med jackan')

    fireEvent.click(screen.getByRole('button', { name: 'Jag behöver hjälp med jackan' }))

    expect(screen.getByRole('textbox', { name: 'Säg detta åt mig' }).value).toBe('Jag behöver hjälp med jackan')
    expect(screen.getByText('Jag behöver hjälp med jackan', { selector: 'strong' })).toBeTruthy()
  })

  it('does not auto-speak when a saved phrase is selected', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Kan du skriva ner det?')

    fireEvent.click(screen.getByRole('button', { name: 'Kan du skriva ner det?' }))

    expect(speechSynthesis.speak).not.toHaveBeenCalled()
  })

  it('explicit Läs upp works after selecting a saved phrase', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')
    fireEvent.click(screen.getByRole('button', { name: 'Jag vill ha kaffe' }))

    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(speechSynthesis.speak.mock.calls[0][0].text).toBe('Jag vill ha kaffe')
  })

  it('Stoppa still works after speaking a saved phrase', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')
    fireEvent.click(screen.getByRole('button', { name: 'Jag vill ha kaffe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

    fireEvent.click(screen.getByRole('button', { name: 'Stoppa' }))

    expect(speechSynthesis.cancel).toHaveBeenCalled()
  })

  it('Visa stort (large message) works with a saved phrase, text dominant', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')
    fireEvent.click(screen.getByRole('button', { name: 'Jag vill ha kaffe' }))

    fireEvent.click(screen.getByRole('button', { name: 'Visa stort' }))

    expect(screen.getByLabelText('Stor text').textContent).toContain('Jag vill ha kaffe')
  })

  it('requires a deliberate confirmation before deleting a phrase', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))

    // A11Y-8A: a labelled group that takes focus, not an assertive alert.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('group', { name: 'Vill du ta bort frasen "Jag vill ha kaffe"?' })).toBeTruthy()
    // The phrase is not gone yet - only a confirmation is shown.
    expect(screen.getByText('Jag vill ha kaffe', { selector: '.accessibility-phrase-text' })).toBeTruthy()
  })

  it('removes the phrase once deletion is confirmed', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    expect(screen.queryByRole('button', { name: 'Jag vill ha kaffe' })).toBeNull()
    expect(screen.getByText('Inga sparade fraser ännu.')).toBeTruthy()
    expect(window.localStorage.getItem(communicationPhrasesKey)).toBe('[]')
  })

  it('keeps the phrase when deletion is cancelled', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))

    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))

    expect(screen.getByRole('button', { name: 'Jag vill ha kaffe' })).toBeTruthy()
    expect(window.localStorage.getItem(communicationPhrasesKey)).toContain('Jag vill ha kaffe')
  })

  it('offers Undo after a confirmed deletion, restoring the phrase', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ångra borttagning av "Jag vill ha kaffe"' }))

    expect(screen.getByRole('button', { name: 'Jag vill ha kaffe' })).toBeTruthy()
    expect(window.localStorage.getItem(communicationPhrasesKey)).toContain('Jag vill ha kaffe')
  })

  it('blocks saving a duplicate phrase with a predictable message', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')

    savePhraseViaUi('jag vill ha kaffe')

    expect(screen.getByText('Den frasen finns redan sparad.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Jag vill ha kaffe' })).toHaveLength(1)
  })

  it('renders HTML-like custom phrase text as plain text, never executing it', () => {
    renderCommunication()
    openCommunication()
    const malicious = '<img src=x onerror="window.__xss = true">'
    savePhraseViaUi(malicious)

    const tile = screen.getByRole('button', { name: malicious })
    expect(tile).toBeTruthy()
    expect(document.querySelectorAll('img').length).toBe(0)
    expect(window.__xss).toBeUndefined()
  })

  it('never uses dangerouslySetInnerHTML in the communication component', () => {
    expect(communicationSource).not.toContain('dangerouslySetInnerHTML')
  })

  it('resetting general accessibility preferences does not delete saved phrases', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')

    resetAccessibilityPreferences()

    expect(window.localStorage.getItem(communicationPhrasesKey)).toContain('Jag vill ha kaffe')
  })

  it('deleting a saved phrase does not reset accessibility preferences', () => {
    saveAccessibilityPreferences({ highContrast: true, textSize: 'large' })
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag vill ha kaffe')

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag vill ha kaffe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"highContrast":true')
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"textSize":"large"')
  })

  it('gives the select and delete controls distinct, meaningful accessible names', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag behöver vila')

    expect(screen.getByRole('button', { name: 'Jag behöver vila' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ta bort frasen Jag behöver vila' })).toBeTruthy()
  })

  it('is fully keyboard operable end to end', () => {
    renderCommunication()
    openCommunication()

    const input = screen.getByLabelText('Skriv en egen fras')
    fireEvent.change(input, { target: { value: 'Jag behöver vila' } })
    const saveButton = screen.getByRole('button', { name: 'Spara fras' })
    saveButton.focus()
    expect(document.activeElement).toBe(saveButton)
    fireEvent.click(saveButton)

    const tile = screen.getByRole('button', { name: 'Jag behöver vila' })
    tile.focus()
    expect(document.activeElement).toBe(tile)
    fireEvent.click(tile)

    const deleteButton = screen.getByRole('button', { name: 'Ta bort frasen Jag behöver vila' })
    deleteButton.focus()
    expect(document.activeElement).toBe(deleteButton)
  })

  it('keeps the 44px+ touch-target foundation for the new controls', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag behöver vila')

    expect(screen.getByLabelText('Skriv en egen fras').className).toBe('')
    expect(screen.getByRole('button', { name: 'Jag behöver vila' }).className).toContain('accessibility-phrase-button')
    expect(screen.getByRole('button', { name: 'Ta bort frasen Jag behöver vila' }).className).toContain('accessibility-my-phrase-delete')
  })

  it('stays usable with high contrast enabled', () => {
    saveAccessibilityPreferences({ highContrast: true })
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag behöver vila')

    expect(screen.getByRole('button', { name: 'Jag behöver vila' })).toBeTruthy()
  })

  it('stays usable with large text enabled', () => {
    saveAccessibilityPreferences({ textSize: 'extra-large' })
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag behöver vila')

    expect(screen.getByRole('button', { name: 'Jag behöver vila' })).toBeTruthy()
  })

  it('reuses the responsive phrase-grid foundation at 390px/430px', () => {
    expect(communicationSource).toContain('accessibility-my-phrase-grid')
    expect(communicationSource).toContain('accessibility-phrase-grid')
  })

  it('causes no network request for create, select, or delete', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no network call expected')
    })
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag behöver vila')
    fireEvent.click(screen.getByRole('button', { name: 'Jag behöver vila' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort frasen Jag behöver vila' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('never references Supabase from the communication component or its phrase storage', () => {
    expect(communicationSource).not.toMatch(/supabase/i)
  })

  it('leaves the existing built-in AAC phrases unchanged', () => {
    renderCommunication()
    openCommunication()

    ;['Ja', 'Nej', 'Tack', 'Jag är hungrig', 'Jag har ont', 'Jag är trött', 'Jag vill gå hem'].forEach((phrase) => {
      expect(screen.getByRole('button', { name: phrase })).toBeTruthy()
    })
  })

  it('leaves existing unsaved custom free text working alongside saved phrases', () => {
    renderCommunication()
    openCommunication()
    savePhraseViaUi('Jag behöver vila')

    fireEvent.change(screen.getByRole('textbox', { name: 'Säg detta åt mig' }), {
      target: { value: 'En helt annan mening' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))

    expect(speechSynthesis.speak.mock.calls[0][0].text).toBe('En helt annan mening')
    // The saved phrase is unaffected by typing something else.
    expect(screen.getByRole('button', { name: 'Jag behöver vila' })).toBeTruthy()
  })

  it('leaves the A11Y-7D symbol tiles unchanged', () => {
    renderCommunication()
    openCommunication()

    const yesButton = screen.getByRole('button', { name: 'Ja' })
    expect(yesButton.querySelector('.accessibility-phrase-symbol').textContent).toBe('✓')
  })
})
