/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import ProgressCenter from '../ProgressCenter.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

// A11Y-8X3 (8M B13): ConfirmDialog, the ProgressCenter confirmations, and a
// gate that window.confirm does not come back. The real focus trap, Escape
// and focus return in the app are proven in Chromium
// (tests/a11y/confirm-dialogs.spec.js).

const root = resolve(process.cwd(), 'src')

// window.confirm calls per production file after 8X3. A file may only go
// down; CloudBackupPanel (Molnbackup) is Cursor-owned and not touched.
const allowedConfirmCalls = {
  'App.jsx': 2,
  'components/CloudBackupPanel.jsx': 4,
  'components/CoachMemoryReview.jsx': 1,
  'components/GoalsHabitsPanel.jsx': 1,
  'components/ManualAcceptanceRunner.jsx': 2,
  'components/MealLogger.jsx': 4,
  'components/RecipeManager.jsx': 1,
  'components/WeeklyMealPlanner.jsx': 5,
  'components/mealTemplates/MealQuickAdd.jsx': 1,
  'components/more/AccessibilityHub.jsx': 1,
  'components/nutrition/DietaryPreferencesPanel.jsx': 1,
}

function productionFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return productionFiles(path)
    return /\.(jsx?|tsx?)$/.test(name) && !/\.test\.|\.spec\./.test(name) ? [path] : []
  })
}

function confirmCalls(code) {
  const withoutComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  return (withoutComments.match(/\bwindow\s*\.\s*confirm\s*\(|(?<![\w.$])confirm\s*\(/g) || []).length
}

function MeasurementsHarness({ onChange }) {
  const [measurements, setMeasurements] = useState([
    { date: '2026-09-01', id: 'm1', type: 'waist', value: 90 },
    { date: '2026-09-10', id: 'm2', type: 'waist', value: 89 },
  ])
  return (
    <ProgressCenter
      bodyMeasurements={measurements}
      onBodyMeasurementsChange={(next) => { onChange(next); setMeasurements(next) }}
      view="measurements"
    />
  )
}

describe('ConfirmDialog (8M B13)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
  })
  afterEach(cleanup)

  it('confirm gate: window.confirm only where it is still allowed, never more', () => {
    const counts = Object.fromEntries(productionFiles(root)
      .map((path) => [relative(root, path), confirmCalls(readFileSync(path, 'utf8'))])
      .filter(([, count]) => count > 0))
    for (const [file, count] of Object.entries(counts)) {
      expect(count, `${file}: window.confirm calls`).toBeLessThanOrEqual(allowedConfirmCalls[file] ?? 0)
    }
    expect(counts['components/ProgressCenter.jsx']).toBeUndefined()
    expect(counts['components/CloudBackupPanel.jsx']).toBe(4)
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBeLessThanOrEqual(23)
    expect(confirmCalls("if (window.confirm('x')) {}\n// window.confirm(")).toBe(1)
  })

  it('is a named alertdialog with the question as description; Avbryt is focused first; one action per confirmation', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog confirmLabel="Ta bort" description="Vill du ta bort rapporten?" title="Ta bort rapport" onCancel={onCancel} onConfirm={onConfirm} />)
    const dialog = screen.getByRole('alertdialog', { name: 'Ta bort rapport' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe('Vill du ta bort rapporten?')
    const cancel = within(dialog).getByRole('button', { name: 'Avbryt' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.click(cancel)
    expect(onCancel).toHaveBeenCalledTimes(1)
    const confirm = within(dialog).getByRole('button', { name: 'Ta bort' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('ProgressCenter, body measurement: Avbryt and Escape keep it, "Ta bort" removes only that one', () => {
    const onChange = vi.fn()
    render(<MeasurementsHarness onChange={onChange} />)
    const removeButtons = () => screen.getAllByRole('button', { name: 'Ta bort' })
    expect(removeButtons()).toHaveLength(2)

    fireEvent.click(removeButtons()[0])
    let dialog = screen.getByRole('alertdialog', { name: 'Ta bort kroppsmått' })
    expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe('Vill du ta bort det här kroppsmåttet?')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.click(removeButtons()[0])
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(removeButtons()[0])
    dialog = screen.getByRole('alertdialog', { name: 'Ta bort kroppsmått' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ta bort' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toHaveLength(1)
    expect(removeButtons()).toHaveLength(1)
    // The row and its button are gone: focus goes to the measurements heading.
    expect(document.activeElement.tagName).toBe('H3')
  })
})
