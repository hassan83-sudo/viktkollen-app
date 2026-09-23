/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlanCommercialAdmin from './PlanCommercialAdmin.jsx'

const getSession = vi.fn()

vi.mock('../../services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
    },
  },
}))

const PRICES = [4, 7, 9, 12, 15, 19, 29, 39, 49, 59, 69, 79, 89, 99]

function planRows(enabledMajor = null) {
  return PRICES.map((major, index) => ({
    display_order: index + 1,
    enabled_for_sale: major === enabledMajor,
    plan_id: `plan.prelim.sek.month.${String(major).padStart(2, '0')}`,
    price_sek_minor: major * 100,
    quota_status: 'PRELIMINARY',
    version: major === enabledMajor ? 1 : 0,
  }))
}

function mockAdmin({ listStatus = 200, plans = planRows(), sessionStatus = 200, write } = {}) {
  getSession.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } })
  vi.stubGlobal('fetch', vi.fn(async (path, options = {}) => {
    const url = String(path)
    if (options.method === 'POST') {
      return {
        json: async () => write.payload,
        ok: write.ok,
        status: write.status,
      }
    }
    if (url.includes('resource=plan_commercial')) {
      return {
        json: async () => ({ ok: listStatus === 200, plans }),
        ok: listStatus === 200,
        status: listStatus,
      }
    }
    return {
      json: async () => ({ ok: sessionStatus === 200, session: { authorized: true } }),
      ok: sessionStatus === 200,
      status: sessionStatus,
    }
  }))
}

describe('BILL-6B2A plan commercial admin ui', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    getSession.mockReset()
  })

  it('shows the 14 candidate prices as OFF for an admin and does not offer purchase', async () => {
    mockAdmin()
    render(<PlanCommercialAdmin />)
    expect(await screen.findByText('4 kr')).toBeTruthy()
    for (const price of PRICES) {
      expect(screen.getByText(`${price} kr`)).toBeTruthy()
    }
    expect(screen.getAllByText('OFF')).toHaveLength(14)
    expect(screen.getAllByText('PRELIMINARY / NOT FINALIZED').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /köp|buy|checkout/i })).toBeNull()
  })

  it('hides the panel from an ordinary user', async () => {
    mockAdmin({ sessionStatus: 403 })
    const { container } = render(<PlanCommercialAdmin />)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    expect(container.textContent).toBe('')
  })

  it('does not invent plans when the commercial read fails', async () => {
    mockAdmin({ listStatus: 503, plans: planRows(4) })
    render(<PlanCommercialAdmin />)
    expect((await screen.findByRole('alert')).textContent).toContain('Inga planer visas som tillgängliga')
    expect(screen.queryByText('4 kr')).toBeNull()
    expect(screen.queryByText('ON')).toBeNull()
  })

  it('keeps OFF when a sale toggle fails and shows ON only after the server accepts it', async () => {
    mockAdmin({
      write: { ok: false, payload: { ok: false }, status: 503 },
    })
    render(<PlanCommercialAdmin />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aktivera 4 kr' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Ändringen sparades inte.')
    expect(screen.getAllByText('OFF')).toHaveLength(14)
    expect(screen.queryByText('ON')).toBeNull()

    cleanup()
    mockAdmin({
      write: { ok: true, payload: { ok: true, plans: planRows(4) }, status: 200 },
    })
    render(<PlanCommercialAdmin />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aktivera 4 kr' }))
    expect(await screen.findByText('ON')).toBeTruthy()
    expect(screen.getAllByText('OFF')).toHaveLength(13)
  })
})
