/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SumUpCheckoutInspectAdmin from './SumUpCheckoutInspectAdmin.jsx'

const getSession = vi.fn()

vi.mock('../../services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
    },
  },
}))

afterEach(() => {
  cleanup()
  getSession.mockReset()
  vi.unstubAllGlobals()
})

describe('SumUpCheckoutInspectAdmin', () => {
  it('hides when the signed-in user is not billing_admin', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ billing_admin: false, ok: true }),
      ok: true,
      status: 200,
    })))
    const { container } = render(<SumUpCheckoutInspectAdmin />)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('calls the inspect route with the session Bearer token', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } })
    const fetchImpl = vi.fn(async (path, options = {}) => {
      const url = String(path)
      if (url.includes('/api/billing/capability')) {
        return {
          json: async () => ({ billing_admin: true, ok: true }),
          ok: true,
          status: 200,
        }
      }
      return {
        json: async () => ({
          checkoutStatus: 'PAID',
          exactlyOneSuccessfulTransaction: true,
          intentExpired: true,
          ok: true,
          paymentInstrumentTokenPresent: true,
          purposeSetupRecurring: true,
        }),
        ok: true,
        status: 200,
      }
    })
    vi.stubGlobal('fetch', fetchImpl)
    render(<SumUpCheckoutInspectAdmin />)
    expect(await screen.findByRole('button', { name: 'Kontrollera betald 12 SEK-checkout' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Kontrollera betald 12 SEK-checkout' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Status: PAID'))
    const inspectCall = fetchImpl.mock.calls.find(([path]) => String(path).includes('/api/billing/sumup-checkout-inspect'))
    expect(inspectCall).toBeTruthy()
    expect(String(inspectCall[0])).toContain('chk_3552adcebd09484eb0ff05629af65586')
    expect(inspectCall[1].headers.Authorization).toBe('Bearer admin-token')
    expect(JSON.stringify(inspectCall[1])).not.toMatch(/apiKey|SUMUP_API_KEY|card_number/i)
    expect(screen.getByRole('status').textContent).toContain('payment_instrument.token: ja')
    expect(screen.getByRole('status').textContent).not.toMatch(/6878cb7f|test-key/)
  })
})
