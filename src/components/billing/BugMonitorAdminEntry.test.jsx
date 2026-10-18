/* @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BugMonitorAdminEntry from './BugMonitorAdminEntry.jsx'

const getSession = vi.fn()

vi.mock('../../features/aiHelp/SupportPanel.jsx', () => ({
  default: ({ admin }) => <section aria-label={admin ? 'Support admin queue' : 'Customer support'} />,
}))

vi.mock('../../services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
    },
  },
}))

function mockCapability({ billingAdmin = true, status = 200 } = {}) {
  const fetchImpl = vi.fn(async (path) => {
    if (String(path) === '/api/billing/capability') {
      return { json: async () => ({ billing_admin: billingAdmin, ok: status === 200 }), ok: status === 200, status }
    }
    return { json: async () => ({ ok: false }), ok: false, status: 500 }
  })
  vi.stubGlobal('fetch', fetchImpl)
  return fetchImpl
}

describe('AI Bug Monitor entry under More', () => {
  afterEach(() => {
    cleanup()
    getSession.mockReset()
    vi.unstubAllGlobals()
  })

  it('shows the entry for a billing admin without loading the plan list', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } })
    const fetchImpl = mockCapability()
    render(<BugMonitorAdminEntry />)

    expect(await screen.findByText('AI Bug Monitor')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'AI Bug Monitor' })).toBeTruthy()
    const paths = fetchImpl.mock.calls.map(([path]) => String(path))
    // Capability first; the Security Center panel then reads its own admin
    // endpoint. The plan list is never loaded.
    expect(paths[0]).toBe('/api/billing/capability')
    expect(paths.every((path) => path === '/api/billing/capability' || path === '/api/security-center')).toBe(true)
    expect(screen.getByRole('region', { name: 'Säkerhetscentral' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Support admin queue' })).toBeTruthy()
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-token')
  })

  it('stays hidden for a signed-in user who is not a billing admin', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } })
    const fetchImpl = mockCapability({ billingAdmin: false })
    render(<BugMonitorAdminEntry />)

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(screen.queryByText('AI Bug Monitor')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Säkerhetscentral' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Support admin queue' })).toBeNull()
  })

  it('stays hidden when the capability check fails', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } })
    const fetchImpl = mockCapability({ status: 500 })
    render(<BugMonitorAdminEntry />)

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(screen.queryByText('AI Bug Monitor')).toBeNull()
  })

  it('stays hidden without a session and makes no request', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const fetchImpl = mockCapability()
    render(<BugMonitorAdminEntry />)

    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByText('AI Bug Monitor')).toBeNull()
  })
})
