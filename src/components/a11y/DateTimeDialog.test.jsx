/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import DateTimeDialog from './DateTimeDialog.jsx'
import { isValidDateValue, isValidTimeValue } from './dateTimeValidation.js'

// A11Y-8X1 (8M B13): the date/time dialog that replaces window.prompt in
// MealLogger and ProgressCenter. The real focus trap, Escape and focus return
// are proven in Chromium (tests/a11y/date-time-dialogs.spec.js).

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

function renderDialog(props = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(<DateTimeDialog initialDate="2026-09-20" initialTime="07:30" onCancel={onCancel} onSave={onSave} saveLabel="Kopiera" title="Kopiera Gröt" {...props} />)
  return { onCancel, onSave }
}

describe('DateTimeDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
  })
  afterEach(cleanup)

  it('is a named modal with labelled date and time fields and their initial values', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Kopiera Gröt' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    const date = screen.getByLabelText('Datum')
    const time = screen.getByLabelText('Tid')
    expect(date.getAttribute('type')).toBe('date')
    expect(time.getAttribute('type')).toBe('time')
    expect(date.value).toBe('2026-09-20')
    expect(time.value).toBe('07:30')
    expect(document.activeElement).toBe(date)
  })

  it('saves valid values', () => {
    const { onSave } = renderDialog()
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-09-21' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kopiera' }))
    expect(onSave).toHaveBeenCalledWith('2026-09-21', '07:30')
  })

  it('does not save empty values: one status message, invalid fields described, cleared on change', () => {
    const { onSave } = renderDialog()
    const date = screen.getByLabelText('Datum')
    const time = screen.getByLabelText('Tid')
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')

    fireEvent.change(date, { target: { value: '' } })
    fireEvent.change(time, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kopiera' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(status.textContent).toBe('Ange ett giltigt datum (ÅÅÅÅ-MM-DD). Ange en giltig tid (TT:MM).')
    expect(date.getAttribute('aria-invalid')).toBe('true')
    expect(time.getAttribute('aria-invalid')).toBe('true')
    expect(date.getAttribute('aria-describedby')).toBe(status.id)
    expect(screen.getAllByRole('status')).toHaveLength(1)

    fireEvent.change(date, { target: { value: '2026-09-22' } })
    expect(status.textContent).toBe('')
    expect(date.getAttribute('aria-invalid')).toBeNull()
    expect(date.getAttribute('aria-describedby')).toBeNull()
  })

  it('Cancel calls onCancel without saving', () => {
    const { onCancel, onSave } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('validates real dates and 24 h times', () => {
    expect(isValidDateValue('2026-02-28')).toBe(true)
    expect(isValidDateValue('2026-02-30')).toBe(false)
    expect(isValidDateValue('2026-13-01')).toBe(false)
    expect(isValidDateValue('20/9')).toBe(false)
    expect(isValidDateValue('')).toBe(false)
    expect(isValidTimeValue('23:59')).toBe(true)
    expect(isValidTimeValue('24:00')).toBe(false)
    expect(isValidTimeValue('7')).toBe(false)
  })

  it('MealLogger and ProgressCenter no longer ask for date or time with window.prompt', () => {
    for (const path of ['src/components/MealLogger.jsx', 'src/components/ProgressCenter.jsx']) {
      const code = source(path)
      expect(code).toContain('<DateTimeDialog')
      expect(code).not.toMatch(/window\.prompt\(t\('(logger|center)\.prompts\.(copy|favorite)(Date|Time)'/)
    }
  })
})
