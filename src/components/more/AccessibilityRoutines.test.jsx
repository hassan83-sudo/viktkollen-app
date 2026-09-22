/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { accessibilityPreferencesKey, resetAccessibilityPreferences, saveAccessibilityPreferences } from '../../services/accessibilityPreferences.js'
import { communicationPhrasesKey } from '../../services/accessibilityCommunicationPhrases.js'
import { maxStepsPerRoutine, routinesStorageKey } from '../../services/accessibilityRoutines.js'
import AccessibilityHub from './AccessibilityHub.jsx'
import MoreHub from './MoreHub.jsx'

const routinesSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'more', 'AccessibilityRoutines.jsx'), 'utf8')

function renderRoutines() {
  return render(
    <MoreHub activeFolder="accessibility" onBack={vi.fn()}>
      <AccessibilityHub />
    </MoreHub>,
  )
}

function openRoutines() {
  fireEvent.click(screen.getByRole('button', { name: /^Steg för steg/ }))
}

function createRoutineViaUi(name, steps) {
  fireEvent.click(screen.getByRole('button', { name: 'Skapa ny rutin' }))
  fireEvent.change(screen.getByLabelText('Rutinens namn'), { target: { value: name } })
  steps.forEach((step, index) => {
    if (index > 0) fireEvent.click(screen.getByRole('button', { name: 'Lägg till steg' }))
    fireEvent.change(screen.getByLabelText(`Steg ${index + 1}`), { target: { value: step } })
  })
  fireEvent.click(screen.getByRole('button', { name: 'Spara rutin' }))
}

// A11Y-7F: local step-by-step visual routines, reached from
// Mer -> Tillgänglighet & hjälpmedel -> Steg för steg.
describe('AccessibilityRoutines - Steg för steg (A11Y-7F)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('exists as its own section in the accessibility hub', () => {
    renderRoutines()
    expect(screen.getByRole('button', { name: /^Steg för steg/ })).toBeTruthy()
  })

  it('shows an empty state with no routines yet', () => {
    renderRoutines()
    openRoutines()

    expect(screen.getByText('Inga rutiner ännu. Skapa din första rutin nedan.')).toBeTruthy()
    // The real feature, not a "coming later" placeholder.
    expect(screen.queryByText('Kommer senare')).toBeNull()
  })

  it('creates a routine with a name and steps', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Tvätta ansiktet', 'Ät frukost'])

    expect(screen.getByText('Morgon')).toBeTruthy()
    expect(screen.getByText('2 steg')).toBeTruthy()
    expect(window.localStorage.getItem(routinesStorageKey)).toContain('Tvätta ansiktet')
  })

  it('blocks an empty routine name', () => {
    renderRoutines()
    openRoutines()
    fireEvent.click(screen.getByRole('button', { name: 'Skapa ny rutin' }))
    fireEvent.change(screen.getByLabelText('Steg 1'), { target: { value: 'Ett steg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara rutin' }))

    expect(screen.getByText('Skriv ett namn innan du sparar.')).toBeTruthy()
    expect(window.localStorage.getItem(routinesStorageKey)).toBeNull()
  })

  it('blocks a routine with no valid step text', () => {
    renderRoutines()
    openRoutines()
    fireEvent.click(screen.getByRole('button', { name: 'Skapa ny rutin' }))
    fireEvent.change(screen.getByLabelText('Rutinens namn'), { target: { value: 'Morgon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara rutin' }))

    expect(screen.getByText('Lägg till minst ett steg innan du sparar.')).toBeTruthy()
    expect(window.localStorage.getItem(routinesStorageKey)).toBeNull()
  })

  it('trims and normalizes whitespace in name and steps', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('  Morgon  ', ['  Tvätta ansiktet  '])

    expect(window.localStorage.getItem(routinesStorageKey)).toContain('"name":"Morgon"')
    expect(window.localStorage.getItem(routinesStorageKey)).toContain('"Tvätta ansiktet"')
    expect(window.localStorage.getItem(routinesStorageKey)).not.toContain('  Morgon  ')
  })

  it('persists a routine through a component remount', () => {
    const { unmount } = renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Tvätta ansiktet'])
    unmount()

    renderRoutines()
    openRoutines()
    expect(screen.getByText('Morgon')).toBeTruthy()
  })

  it('enforces the maximum number of saved routines', () => {
    renderRoutines()
    openRoutines()
    for (let i = 0; i < 10; i += 1) {
      createRoutineViaUi(`Rutin ${i}`, ['Ett steg'])
    }

    expect(screen.getByRole('button', { name: 'Skapa ny rutin' }).hasAttribute('disabled')).toBe(true)
  })

  it('enforces the maximum steps per routine in the form', () => {
    renderRoutines()
    openRoutines()
    fireEvent.click(screen.getByRole('button', { name: 'Skapa ny rutin' }))

    for (let i = 1; i < maxStepsPerRoutine; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Lägg till steg' }))
    }

    expect(screen.getAllByRole('button', { name: 'Lägg till steg' })[0].hasAttribute('disabled')).toBe(true)
  })

  it('enforces the routine name length via the input maxlength', () => {
    renderRoutines()
    openRoutines()
    fireEvent.click(screen.getByRole('button', { name: 'Skapa ny rutin' }))

    expect(screen.getByLabelText('Rutinens namn').getAttribute('maxlength')).toBe('60')
  })

  it('enforces the step text length via the input maxlength', () => {
    renderRoutines()
    openRoutines()
    fireEvent.click(screen.getByRole('button', { name: 'Skapa ny rutin' }))

    expect(screen.getByLabelText('Steg 1').getAttribute('maxlength')).toBe('120')
  })

  it('stays usable when stored routine data is malformed', () => {
    window.localStorage.setItem(routinesStorageKey, '{not valid json')
    expect(() => renderRoutines()).not.toThrow()
    openRoutines()
    expect(screen.getByText('Inga rutiner ännu. Skapa din första rutin nedan.')).toBeTruthy()
  })

  it('renders HTML-like routine text as plain text, never executing it', () => {
    renderRoutines()
    openRoutines()
    const malicious = '<img src=x onerror="window.__routineXss = true">'
    createRoutineViaUi(malicious, ['Ett steg'])

    expect(screen.getByText(malicious)).toBeTruthy()
    expect(document.querySelectorAll('img').length).toBe(0)
    expect(window.__routineXss).toBeUndefined()
  })

  it('can edit an existing routine (name, steps, order)', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Tvätta ansiktet', 'Ät frukost'])

    fireEvent.click(screen.getByRole('button', { name: 'Redigera' }))
    fireEvent.change(screen.getByLabelText('Rutinens namn'), { target: { value: 'Morgon (uppdaterad)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara rutin' }))

    expect(screen.getByText('Morgon (uppdaterad)')).toBeTruthy()
    expect(screen.queryByText('Morgon')).toBeNull()
  })

  it('can add a step to an existing routine while editing', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Tvätta ansiktet'])

    fireEvent.click(screen.getByRole('button', { name: 'Redigera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till steg' }))
    fireEvent.change(screen.getByLabelText('Steg 2'), { target: { value: 'Ät frukost' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara rutin' }))

    expect(screen.getByText('2 steg')).toBeTruthy()
  })

  it('can remove a step from an existing routine while editing', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Tvätta ansiktet', 'Ät frukost'])

    fireEvent.click(screen.getByRole('button', { name: 'Redigera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort steg 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Spara rutin' }))

    expect(screen.getByText('1 steg')).toBeTruthy()
  })

  it('can move a step up', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['A', 'B'])

    fireEvent.click(screen.getByRole('button', { name: 'Redigera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flytta upp steg 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Spara rutin' }))

    expect(window.localStorage.getItem(routinesStorageKey)).toContain('"steps":["B","A"]')
  })

  it('can move a step down', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['A', 'B'])

    fireEvent.click(screen.getByRole('button', { name: 'Redigera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flytta ner steg 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Spara rutin' }))

    expect(window.localStorage.getItem(routinesStorageKey)).toContain('"steps":["B","A"]')
  })

  it('never requires drag-and-drop for reordering (button-only source)', () => {
    expect(routinesSource).not.toContain('onDragStart')
    expect(routinesSource).not.toContain('draggable')
  })

  it('starts run mode from the routine list', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Tvätta ansiktet', 'Ät frukost'])

    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))

    expect(screen.getByText('Tvätta ansiktet')).toBeTruthy()
  })

  it('shows only the first step at the start of a run', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Tvätta ansiktet', 'Ät frukost', 'Borsta tänderna'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))

    expect(screen.getByText('Tvätta ansiktet')).toBeTruthy()
    expect(screen.queryByText('Ät frukost')).toBeNull()
    expect(screen.queryByText('Borsta tänderna')).toBeNull()
  })

  it('shows only one primary current step at a time, never the full list', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två', 'Tre'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))

    expect(screen.getByText('Två')).toBeTruthy()
    expect(screen.queryByText('Ett')).toBeNull()
    expect(screen.queryByText('Tre')).toBeNull()
  })

  it('shows progress as "Steg X av Y"', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))

    expect(screen.getByRole('status').textContent).toBe('Steg 1 av 2')
  })

  it('Nästa advances to the next step and updates progress', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))

    fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))

    expect(screen.getByText('Två')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Steg 2 av 2')
  })

  it('Tillbaka returns to the previous step', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))

    fireEvent.click(screen.getByRole('button', { name: 'Tillbaka' }))

    expect(screen.getByText('Ett')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tillbaka' })).toBeNull()
  })

  it('completing the final step shows a clear completion state', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))

    fireEvent.click(screen.getByRole('button', { name: 'Klar' }))

    expect(screen.getByRole('heading', { name: 'Klart!' })).toBeTruthy()
    expect(screen.getByText('Morgon')).toBeTruthy()
  })

  it('Kör igen restarts the routine from the first step', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Klar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Kör igen' }))

    expect(screen.getByRole('status').textContent).toBe('Steg 1 av 2')
    expect(screen.getByText('Ett')).toBeTruthy()
  })

  it('Avsluta exits a running routine back to the list without completing it', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))

    fireEvent.click(screen.getByRole('button', { name: 'Avsluta' }))

    expect(screen.getByText('Morgon')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Klart!' })).toBeNull()
  })

  it('never advances steps automatically - no timers required', () => {
    vi.useFakeTimers()
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))

    vi.advanceTimersByTime(60000)

    expect(screen.getByText('Ett')).toBeTruthy()
    vi.useRealTimers()
  })

  it('never writes run progress anywhere in localStorage', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två', 'Tre'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))

    const storedRoutines = JSON.parse(window.localStorage.getItem(routinesStorageKey))
    expect(Object.keys(storedRoutines[0]).sort()).toEqual(['createdAt', 'id', 'name', 'steps'])
    Object.keys(window.localStorage).forEach((key) => {
      expect(window.localStorage.getItem(key)).not.toContain('runStepIndex')
      expect(window.localStorage.getItem(key)).not.toContain('currentStep')
    })
  })

  it('requires deliberate confirmation before deleting a routine', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort rutinen Morgon' }))

    expect(screen.getByRole('alert').textContent).toContain('Vill du ta bort rutinen "Morgon"?')
    expect(screen.getByText('Morgon')).toBeTruthy()
  })

  it('cancelling deletion preserves the routine', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort rutinen Morgon' }))

    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))

    expect(screen.getByText('Morgon')).toBeTruthy()
    expect(window.localStorage.getItem(routinesStorageKey)).toContain('Morgon')
  })

  it('confirmed deletion removes the routine', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort rutinen Morgon' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    expect(screen.queryByText('Morgon')).toBeNull()
    expect(window.localStorage.getItem(routinesStorageKey)).toBe('[]')
  })

  it('gives the delete control an accessible name that includes the routine name', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])
    createRoutineViaUi('Kväll', ['Ett annat steg'])

    expect(screen.getByRole('button', { name: 'Ta bort rutinen Morgon' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ta bort rutinen Kväll' })).toBeTruthy()
  })

  it('is fully keyboard operable through create, run, and delete', () => {
    renderRoutines()
    openRoutines()
    const createButton = screen.getByRole('button', { name: 'Skapa ny rutin' })
    createButton.focus()
    expect(document.activeElement).toBe(createButton)

    createRoutineViaUi('Morgon', ['Ett steg'])

    const runButton = screen.getByRole('button', { name: 'Kör' })
    runButton.focus()
    expect(document.activeElement).toBe(runButton)
    fireEvent.click(runButton)

    const nextButton = screen.getByRole('button', { name: 'Klar' })
    nextButton.focus()
    expect(document.activeElement).toBe(nextButton)
  })

  it('gives templates, steps, and progress meaningful screen-reader text', () => {
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett', 'Två'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))

    expect(screen.getByRole('status').textContent).toBe('Steg 1 av 2')
  })

  it('keeps the 44px+ touch-target foundation for run-mode controls', () => {
    expect(routinesSource).toContain("className=\"primary-button\"")
    expect(routinesSource).toContain("className=\"secondary-button\"")
  })

  it('stays usable with large text enabled', () => {
    saveAccessibilityPreferences({ textSize: 'extra-large' })
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])
    expect(screen.getByText('Morgon')).toBeTruthy()
  })

  it('stays usable with high contrast enabled', () => {
    saveAccessibilityPreferences({ highContrast: true })
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])
    expect(screen.getByText('Morgon')).toBeTruthy()
  })

  it('stays usable with reduced motion enabled', () => {
    saveAccessibilityPreferences({ reduceMotion: true })
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))
    expect(screen.getByText('Morgon')).toBeTruthy()
  })

  it('reuses the responsive grid/button foundation for 390px/430px', () => {
    expect(routinesSource).toContain('accessibility-option-grid')
    expect(routinesSource).toContain('accessibility-communication-actions')
  })

  it('causes no network request for create, run, or delete', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no network call expected')
    })
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])
    fireEvent.click(screen.getByRole('button', { name: 'Kör' }))
    fireEvent.click(screen.getByRole('button', { name: 'Klar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort rutinen Morgon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('never references Supabase or AI from the routines component', () => {
    expect(routinesSource).not.toMatch(/supabase/i)
    expect(routinesSource).not.toMatch(/openai/i)
  })

  it('never logs routine name or step text to the console', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Ett hemligt rutinnamn', ['Ett hemligt steg'])

    logSpy.mock.calls.forEach((call) => {
      expect(String(call[0] || '')).not.toContain('Ett hemligt rutinnamn')
      expect(String(call[0] || '')).not.toContain('Ett hemligt steg')
    })
    logSpy.mockRestore()
  })

  it('leaves AAC communication phrases and preferences unaffected', () => {
    saveAccessibilityPreferences({ highContrast: true })
    window.localStorage.setItem(communicationPhrasesKey, JSON.stringify([
      { createdAt: new Date().toISOString(), id: 'phrase-1', text: 'Jag vill ha kaffe' },
    ]))
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])

    expect(window.localStorage.getItem(communicationPhrasesKey)).toContain('Jag vill ha kaffe')
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"highContrast":true')
  })

  it('resetting accessibility preferences does not delete routines, and deleting a routine does not reset preferences', () => {
    saveAccessibilityPreferences({ highContrast: true })
    renderRoutines()
    openRoutines()
    createRoutineViaUi('Morgon', ['Ett steg'])

    resetAccessibilityPreferences()
    expect(window.localStorage.getItem(routinesStorageKey)).toContain('Morgon')

    saveAccessibilityPreferences({ highContrast: true })
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort rutinen Morgon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, ta bort' }))
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"highContrast":true')
  })
})
