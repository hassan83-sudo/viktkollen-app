/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NoticeHub from './NoticeHub.jsx'
import i18n from '../i18n/index.js'
import { batteryNoticeStorageKey } from '../services/battery/batteryNoticeModel.js'

describe('NoticeHub', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
  })

  it('requires an explicit submit before a quick reminder is saved', () => {
    const onRemindersChange = vi.fn()
    render(<NoticeHub onRemindersChange={onRemindersChange} reminderState={{ reminders: [] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Drick vatten' }))
    expect(onRemindersChange).not.toHaveBeenCalled()
    expect(screen.getAllByText(/Drick vatten/).length).toBeGreaterThan(1)

    fireEvent.click(screen.getByRole('button', { name: 'Aktivera påminnelse' }))
    expect(onRemindersChange).toHaveBeenCalledTimes(1)
    expect(onRemindersChange.mock.calls[0][0].reminders[0]).toMatchObject({
      scheduleType: 'once',
      title: 'Drick vatten',
    })
  })

  it('can pause, resume, complete, snooze, and confirm deletion for saved reminders', () => {
    const onRemindersChange = vi.fn()
    render(<NoticeHub onRemindersChange={onRemindersChange} reminderState={{
      reminders: [{ id: 'water', scheduleType: 'daily', startDate: '2026-08-27', time: '09:00', title: 'Vatten' }],
    }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Stäng av tillfälligt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Markera klar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Snooza 30 min' }))
    fireEvent.click(screen.getByRole('button', { name: 'Radera' }))
    expect(screen.getByRole('alert').textContent).toContain('Vill du radera påminnelsen?')
    fireEvent.click(screen.getByRole('button', { name: 'Ja, radera' }))

    expect(onRemindersChange).toHaveBeenCalledTimes(4)
    expect(onRemindersChange.mock.calls[0][0].reminders[0].pausedAt).toBeTruthy()
    expect(onRemindersChange.mock.calls[3][0].reminders[0].archivedAt).toBeTruthy()
  })

  it('prepares a memory technique reminder without saving before submit', () => {
    const onRemindersChange = vi.fn()
    render(<NoticeHub onRemindersChange={onRemindersChange} reminderState={{ reminders: [] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Koppla ihop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skapa påminnelse från tekniken' }))

    expect(onRemindersChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Text').value).toBe('Koppla ihop det viktiga med jackan')
    expect(screen.getByLabelText('Beskrivning').value).toContain('Koppla det du vill minnas')

    fireEvent.click(screen.getByRole('button', { name: 'Aktivera påminnelse' }))
    expect(onRemindersChange).toHaveBeenCalledTimes(1)
    expect(onRemindersChange.mock.calls[0][0].reminders[0]).toMatchObject({
      description: expect.stringContaining('nycklar'),
      source: 'reminder_hub',
      title: 'Koppla ihop det viktiga med jackan',
    })
  })

  it('stores battery readings locally and prepares a charge reminder through reminders v2', () => {
    const onRemindersChange = vi.fn()
    render(<NoticeHub onRemindersChange={onRemindersChange} reminderState={{ reminders: [] }} />)

    fireEvent.click(screen.getByLabelText('Aktivera lokal batterihjälp'))
    fireEvent.change(screen.getByLabelText('Batteri %'), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara manuell nivå' }))

    const stored = JSON.parse(window.localStorage.getItem(batteryNoticeStorageKey))
    expect(stored).toMatchObject({ enabled: true, version: 1 })
    expect(stored.history[0]).toMatchObject({ percent: 42, source: 'manual' })

    fireEvent.click(screen.getByRole('button', { name: 'Skapa Ladda mobilen' }))
    expect(onRemindersChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Text').value).toBe('Ladda mobilen')

    fireEvent.click(screen.getByRole('button', { name: 'Aktivera påminnelse' }))
    expect(onRemindersChange.mock.calls[0][0].reminders[0]).toMatchObject({
      description: expect.stringContaining('Batterihjälpen föreslår laddning'),
      title: 'Ladda mobilen',
    })
  })
})
