/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NoticeHub from './NoticeHub.jsx'
import i18n from '../i18n/index.js'

describe('NoticeHub', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
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
})
