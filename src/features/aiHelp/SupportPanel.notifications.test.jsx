/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SupportPanel from './SupportPanel.jsx'
import { requestSupport } from './supportClient.js'
import { showReminderNotification } from '../../services/reminders/reminderNotifications.js'

vi.mock('./supportClient.js', () => ({ requestSupport: vi.fn() }))
vi.mock('../../services/reminders/reminderNotifications.js', () => ({ showReminderNotification: vi.fn() }))

const pendingTicket = {
  id: '10000000-0000-4000-8000-000000000001',
  category: 'technical', priority: 'high', status: 'open', version: 1,
  notification_pending: true, created_at: '2026-10-17T12:00:00Z',
  thread: [{ role: 'customer', message: 'Testärende' }],
}

describe('admin support notification polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestSupport.mockResolvedValue({ ok: true, pendingCount: 1, tickets: [pendingTicket] })
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('shows pending count and notifies only once for an unchanged ticket version', async () => {
    render(<SupportPanel admin />)
    await waitFor(() => expect(showReminderNotification).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status').textContent).toContain('1')
    expect(showReminderNotification).toHaveBeenCalledWith(expect.objectContaining({ id: `support-${pendingTicket.id}` }))
    screen.getByRole('button', { name: 'Uppdatera ärenden' }).click()
    await waitFor(() => expect(requestSupport).toHaveBeenCalledTimes(2))
    expect(showReminderNotification).toHaveBeenCalledTimes(1)
  })

  it('does not notify for nonpending tickets', async () => {
    requestSupport.mockResolvedValue({ ok: true, pendingCount: 0, tickets: [{ ...pendingTicket, notification_pending: false }] })
    render(<SupportPanel admin />)
    await waitFor(() => expect(requestSupport).toHaveBeenCalled())
    expect(showReminderNotification).not.toHaveBeenCalled()
  })
})
