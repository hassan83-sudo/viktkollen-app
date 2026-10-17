/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import SecurityCenterPanel from './SecurityCenterPanel.jsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SecurityCenterPanel', () => {
  it('displays server events without treating an empty list as proof of safety', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, events: [{ id: 1, type: 'API_RATE_LIMITED', severity: 'medium', feature: 'api', occurred_at: '2026-10-17T12:00:00Z' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SecurityCenterPanel token="test-token" />)
    expect(await screen.findByText('Anropsgräns uppnådd')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/security-center', expect.objectContaining({
      headers: { Authorization: 'Bearer test-token' }, cache: 'no-store',
    }))
  })

  it('alerts admin if security monitoring cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))
    render(<SecurityCenterPanel token="test-token" />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('kan inte läsas'))
  })

  it('does not falsely claim a clean security state for zero events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, events: [] }),
    }))
    render(<SecurityCenterPanel token="test-token" />)
    expect(await screen.findByText(/bekräftar inte att alla säkerhetskontroller är aktiva/)).toBeTruthy()
  })
})
