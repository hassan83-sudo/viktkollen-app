/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import SupportPanel from './SupportPanel.jsx'
import { requestSupport } from './supportClient.js'

vi.mock('./supportClient.js', () => ({ requestSupport: vi.fn() }))

const pendingTicket = {
  id: '10000000-0000-4000-8000-000000000001',
  category: 'technical', priority: 'high', status: 'open', version: 1,
  notification_pending: true, created_at: '2026-10-17T12:00:00Z',
  thread: [{ role: 'customer', message: 'Testärende' }],
}

describe('admin support notification polling', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
    vi.clearAllMocks()
    window.Notification = vi.fn()
    window.Notification.permission = 'granted'
    requestSupport.mockResolvedValue({ ok: true, pendingCount: 1, tickets: [pendingTicket] })
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('shows pending count and notifies only once for an unchanged ticket version', async () => {
    render(<SupportPanel admin />)
    await waitFor(() => expect(window.Notification).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status').textContent).toContain('1')
    expect(window.Notification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ tag: `viktkollen-support-${pendingTicket.id}` }))
    screen.getByRole('button', { name: 'Uppdatera ärenden' }).click()
    await waitFor(() => expect(requestSupport).toHaveBeenCalledTimes(2))
    expect(window.Notification).toHaveBeenCalledTimes(1)
  })

  it('does not notify for nonpending tickets', async () => {
    requestSupport.mockResolvedValue({ ok: true, pendingCount: 0, tickets: [{ ...pendingTicket, notification_pending: false }] })
    render(<SupportPanel admin />)
    await waitFor(() => expect(requestSupport).toHaveBeenCalled())
    expect(window.Notification).not.toHaveBeenCalled()
  })
})
