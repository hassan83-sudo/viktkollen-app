/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SandboxMerchantDiagnosticButton from './SandboxMerchantDiagnosticButton.jsx'
import {
  formatSandboxDiagnosticResult,
  previewSandboxDiagnosticEnabled,
} from './sandboxMerchantDiagnosticButton.js'

const getSession = vi.fn()

vi.mock('../../services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
    },
  },
}))

function mockFetch({ admin = true, diagnostic = { httpStatus: 200, merchant: 'MATCH', sandbox: 'SANDBOX_TRUE' }, diagnosticStatus = 200 } = {}) {
  const fetchImpl = vi.fn(async (path) => {
    if (String(path) === '/api/billing/capability') {
      return { json: async () => ({ billing_admin: admin, ok: true }), ok: true, status: 200 }
    }
    if (String(path) === '/api/billing/sandbox-merchant-check') {
      return { json: async () => diagnostic, ok: diagnosticStatus === 200, status: diagnosticStatus }
    }
    return { json: async () => ({ ok: false }), ok: false, status: 500 }
  })
  vi.stubGlobal('fetch', fetchImpl)
  return fetchImpl
}

describe('preview sandbox merchant diagnostic button', () => {
  afterEach(() => {
    cleanup()
    getSession.mockReset()
    vi.unstubAllGlobals()
  })

  it('stays hidden outside preview and does not read the session', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } })
    const fetchImpl = mockFetch()
    render(<SandboxMerchantDiagnosticButton enabled={false} />)
    await waitFor(() => expect(getSession).not.toHaveBeenCalled())
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Kontrollera Sandbox-handlare' })).toBeNull()
  })

  it('stays hidden without a session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const fetchImpl = mockFetch()
    render(<SandboxMerchantDiagnosticButton enabled />)
    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Kontrollera Sandbox-handlare' })).toBeNull()
  })

  it('stays hidden when the account is not billing admin', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } })
    const fetchImpl = mockFetch({ admin: false })
    render(<SandboxMerchantDiagnosticButton enabled />)
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual(['/api/billing/capability'])
    expect(screen.queryByRole('button', { name: 'Kontrollera Sandbox-handlare' })).toBeNull()
  })

  it('sends one session-backed diagnostic request and shows only the safe result', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } })
    const fetchImpl = mockFetch({
      diagnostic: {
        apiKey: 'admin-token',
        httpStatus: 200,
        merchant: 'MATCH',
        sandbox: 'SANDBOX_TRUE',
      },
    })
    render(<SandboxMerchantDiagnosticButton enabled />)
    fireEvent.click(await screen.findByRole('button', { name: 'Kontrollera Sandbox-handlare' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kontrollera Sandbox-handlare' }))
    expect((await screen.findByRole('status')).textContent).toBe('200 MATCH SANDBOX_TRUE')
    const diagnosticCalls = fetchImpl.mock.calls.filter(([path]) => path === '/api/billing/sandbox-merchant-check')
    expect(diagnosticCalls).toHaveLength(1)
    expect(diagnosticCalls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer admin-token' },
      method: 'GET',
    })
    expect(fetchImpl.mock.calls.some(([path]) => String(path).includes('checkout'))).toBe(false)
    expect(screen.getByRole('status').textContent.includes('admin-token')).toBe(false)
  })

  it('shows the control only on a preview host', () => {
    expect(previewSandboxDiagnosticEnabled('viktkollen-app.vercel.app')).toBe(false)
    expect(previewSandboxDiagnosticEnabled('viktkollen-app-git-main-appsonthego-s-projects.vercel.app')).toBe(false)
    expect(previewSandboxDiagnosticEnabled('viktkollen-app-git-feature-sumup-705353-appsonthego-s-projects.vercel.app')).toBe(true)
  })

  it('shows a gate code and does not invent a merchant result', () => {
    expect(formatSandboxDiagnosticResult({ code: 'KEY_UNREADABLE', ok: false }, 403)).toBe('KEY_UNREADABLE')
    expect(formatSandboxDiagnosticResult({ merchant: 'MATCH', sandbox: 'SANDBOX_TRUE', secret: 'admin-token' }, 200)).toBe('DIAGNOSTIC_FAILED')
  })
})
