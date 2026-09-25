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

const QUOTAS = {
  4: { ai_coach: 30, ai_eye: 40, body_scan: 4, food_scan: 10 },
  99: { ai_coach: 1500, ai_eye: 1500, body_scan: 150, food_scan: 400 },
}

function planRows(enabledMajor = null) {
  return PRICES.map((major, index) => ({
    display_order: index + 1,
    enabled_for_sale: major === enabledMajor,
    plan_id: `plan.prelim.sek.month.${String(major).padStart(2, '0')}`,
    price_sek_minor: major * 100,
    quota_status: 'PRELIMINARY',
    quotas: QUOTAS[major] || { ai_coach: major, ai_eye: major, body_scan: major, food_scan: major },
    version: major === enabledMajor ? 1 : 0,
  }))
}

function mockAdmin({
  billingAdmin = true,
  capabilityStatus = 200,
  listStatus = 200,
  plans = planRows(),
  sessionStatus = 200,
  write,
} = {}) {
  getSession.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } })
  vi.stubGlobal('fetch', vi.fn(async (path, options = {}) => {
    const url = String(path)
    if (url.includes('/api/billing/capability')) {
      return {
        json: async () => ({ billing_admin: billingAdmin, ok: capabilityStatus === 200 }),
        ok: capabilityStatus === 200,
        status: capabilityStatus,
      }
    }
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
    expect(screen.getByText('Ordning 1')).toBeTruthy()
    expect(screen.getByText('AI-coach 30')).toBeTruthy()
    expect(screen.getByText('Matscanning 10')).toBeTruthy()
    expect(screen.getByText('Kroppsscanning 4')).toBeTruthy()
    expect(screen.getByText('AI-Ögat 40')).toBeTruthy()
    expect(screen.getByText('AI-coach 1 500')).toBeTruthy()
    expect(screen.getByText('Matscanning 400')).toBeTruthy()
    expect(screen.getByText('Kroppsscanning 150')).toBeTruthy()
    expect(screen.getByText('AI-Ögat 1 500')).toBeTruthy()
    expect(screen.getByText('Betalning är inte ansluten ännu.')).toBeTruthy()
    expect(screen.getByText('Att markera en plan som tillgänglig aktiverar inte köp eller checkout.')).toBeTruthy()
    expect(screen.getAllByText('PRELIMINARY / NOT FINALIZED').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /köp|buy|checkout|pris|kvot/i })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('hides the panel from an ordinary user without calling the admin API', async () => {
    mockAdmin({ billingAdmin: false })
    const { container } = render(<PlanCommercialAdmin />)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    expect(container.textContent).toBe('')
    const urls = globalThis.fetch.mock.calls.map(([path]) => String(path))
    expect(urls).toEqual(['/api/billing/capability'])
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

  it('runs only the authenticated PostgREST probe and shows a safe result', async () => {
    mockAdmin()
    render(<PlanCommercialAdmin />)
    await screen.findByRole('button', { name: 'Testa PostgREST' })
    const callsBeforeProbe = globalThis.fetch.mock.calls.length
    globalThis.fetch.mockImplementation(async (path) => {
      if (String(path) === '/api/billing/postgrest-probe') {
        return {
          json: async () => ({
            access_token: 'admin-token',
            billingPostgrestReachable: true,
            feature_id: 'food.scan',
            ok: true,
            rows: [{ feature_id: 'food.scan' }],
          }),
          ok: true,
          status: 200,
        }
      }
      return { json: async () => ({ ok: false }), ok: false, status: 500 }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Testa PostgREST' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'PostgREST billing: OK')
    const probeCalls = globalThis.fetch.mock.calls.filter(([path]) => String(path) === '/api/billing/postgrest-probe')
    expect(probeCalls).toHaveLength(1)
    expect(probeCalls[0][1].method).toBe('POST')
    expect(probeCalls[0][1].headers.Authorization).toBe('Bearer admin-token')
    expect(document.body.textContent).not.toMatch(/admin-token|feature_id|food\.scan|rows/)
    const pathsAfterClick = globalThis.fetch.mock.calls.slice(callsBeforeProbe).map(([path]) => String(path))
    expect(pathsAfterClick).toEqual(['/api/billing/postgrest-probe'])
  })

  it('shows only an allowlisted probe error code', async () => {
    mockAdmin()
    render(<PlanCommercialAdmin />)
    await screen.findByRole('button', { name: 'Testa PostgREST' })
    globalThis.fetch.mockImplementation(async () => ({
      json: async () => ({
        code: 'SCHEMA_NOT_EXPOSED',
        message: 'eyJsecret schema must be one of public',
        ok: false,
      }),
      ok: false,
      status: 502,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Testa PostgREST' }))
    expect((await screen.findByRole('status')).textContent).toBe('PostgREST billing: SCHEMA_NOT_EXPOSED')
    expect(document.body.textContent).not.toMatch(/eyJsecret|schema must be/)
  })
})
