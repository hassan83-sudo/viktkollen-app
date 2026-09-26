/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import CoachMemoryReview from '../CoachMemoryReview.jsx'
import GoalsHabitsPanel from '../GoalsHabitsPanel.jsx'
import ManualAcceptanceRunner from '../ManualAcceptanceRunner.jsx'

// The fixture service needs the app's data repository; here only the dialog
// flow and when each action runs are checked.
const fixtures = vi.hoisted(() => ({
  cleanup: vi.fn((options = {}) => (options.confirm ? { ok: true, preview: { total: 3 } } : { preview: { total: 3 } })),
  install: vi.fn(() => ({ ok: true })),
}))
vi.mock('../../services/testing/releaseAcceptanceFixtures.js', () => ({
  cleanupReleaseAcceptanceFixtures: fixtures.cleanup,
  installReleaseAcceptanceFixtures: fixtures.install,
}))

// A11Y-8X6 (8M B13): the last Claude-owned window.confirm calls, in flows
// that are not reached in the offline Chromium app without extra setup
// (archived goals, derived coach memory, the dev-only acceptance runner).
// AICoach, ProgressPhotos and AccessibilityHub are covered in Chromium
// (tests/a11y/final-confirm-dialogs.spec.js).

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }))
  })
}

// A real click focuses the button first; fireEvent.click does not.
function openDialog(trigger, name) {
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('alertdialog', { name })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Avbryt' }))
  return dialog
}

function description(dialog) {
  return document.getElementById(dialog.getAttribute('aria-describedby')).textContent
}

function GoalsHarness({ onChange }) {
  const [state, setState] = useState({
    goals: [{ archivedAt: '2026-09-01', category: 'protein', id: 'g-old', status: 'archived', target: 100, title: 'Gammalt mål' }],
    habits: [],
  })
  return <GoalsHabitsPanel analysisDate="2026-09-26" goalsHabits={state} onGoalsHabitsChange={(next) => { onChange(next); setState(next) }} />
}

describe('final confirm dialogs (8M B13)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('GoalsHabitsPanel: "Ta bort permanent" asks; Avbryt and Escape keep the item; confirm removes it once; focus to the archive heading', () => {
    const onChange = vi.fn()
    render(<GoalsHarness onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Visa arkiv/ }))
    const remove = () => screen.getByRole('button', { name: 'Ta bort permanent' })

    let dialog = openDialog(remove(), 'Ta bort arkiverat objekt')
    expect(description(dialog)).toBe('Vill du ta bort det arkiverade objektet permanent?')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    openDialog(remove(), 'Ta bort arkiverat objekt')
    pressEscape()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()

    dialog = openDialog(remove(), 'Ta bort arkiverat objekt')
    const confirm = within(dialog).getByRole('button', { name: 'Ta bort permanent' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].goals.find((goal) => goal.id === 'g-old')).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Ta bort permanent' })).toBeNull()
    expect(document.activeElement.textContent).toBe('Arkiv och historik')
  })

  it('CoachMemoryReview: "Glöm" asks; Escape closes only the dialog, not the review; confirm forgets once', () => {
    const onClose = vi.fn()
    const onFeedbackChange = vi.fn()
    render(
      <CoachMemoryReview
        adaptiveCoachFeedback={{
          coachMemory: {
            consent: { personalizationEnabled: true, remoteAiMemoryEnabled: false },
            successfulStrategies: [{ category: 'nutrition', confidence: 0.8, evidenceCount: 3, id: 's1', source: 'derived' }],
          },
        }}
        analysisDate="2026-09-26"
        onClose={onClose}
        onFeedbackChange={onFeedbackChange}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Glöm alla härledda minnen' })

    let dialog = openDialog(trigger, 'Glöm härledda coachminnen')
    expect(description(dialog)).toBe('Vill du glömma alla härledda coachminnen? Preferenser behålls.')
    pressEscape()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(onFeedbackChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)

    dialog = openDialog(trigger, 'Glöm härledda coachminnen')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Glöm' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Glöm' }))
    expect(onFeedbackChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('Härledda coachminnen glömdes.')
    expect(document.activeElement).not.toBe(document.body)

    // Without an open dialog, Escape still closes the review.
    pressEscape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ManualAcceptanceRunner: create and clean TESTDATA ask first; Avbryt and Escape do nothing; each action runs once', () => {
    render(<ManualAcceptanceRunner />)
    const create = screen.getByRole('button', { name: 'Skapa TESTDATA' })
    const clean = screen.getByRole('button', { name: 'Rensa TESTDATA' })

    let dialog = openDialog(create, 'Skapa TESTDATA')
    expect(description(dialog)).toBe('Skapa markerad TESTDATA för acceptance-test?')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    expect(fixtures.install).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(create)

    dialog = openDialog(create, 'Skapa TESTDATA')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skapa' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skapa' }))
    expect(fixtures.install).toHaveBeenCalledTimes(1)
    expect(screen.getByText('TESTDATA skapades. Uppdatera appdata vid behov.')).toBeTruthy()

    dialog = openDialog(clean, 'Rensa TESTDATA')
    expect(description(dialog)).toBe('Rensa endast markerad TESTDATA? Kontrollera först cleanup-guiden. Förhandsvisning: 3 objekt.')
    pressEscape()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(fixtures.cleanup.mock.calls.filter(([options]) => options?.confirm)).toHaveLength(0)
    expect(document.activeElement).toBe(clean)

    dialog = openDialog(clean, 'Rensa TESTDATA')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rensa' }))
    expect(fixtures.cleanup.mock.calls.filter(([options]) => options?.confirm)).toHaveLength(1)
    expect(screen.getByText('TESTDATA rensades: 3 objekt.')).toBeTruthy()
  })
})
