/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPlanComparison } from '../../services/billing/planComparison.js'
import { defaultPlanCatalog } from '../../services/billing/planCatalog.js'
import PlanComparison from './PlanComparison.jsx'

const { openHostedCheckout } = vi.hoisted(() => ({ openHostedCheckout: vi.fn() }))

vi.mock('../../services/billing/checkoutReturn.js', async () => {
  const actual = await vi.importActual('../../services/billing/checkoutReturn.js')
  return { ...actual, openHostedCheckout }
})

const getSession = vi.fn()

vi.mock('../../services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
    },
  },
}))

const comparison = buildPlanComparison({
  currentPlanId: 'plan.free',
  plans: defaultPlanCatalog,
})

function mockComparison(body, ok = true) {
  getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } } })
  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => body,
    ok,
    status: ok ? 200 : 503,
  })))
}

function card(priceText) {
  return within(screen.getByText(priceText).closest('li'))
}

describe('PlanComparison', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('renders the server comparison without a purchase action', async () => {
    localStorage.setItem('viktkollen.plan', 'plan.prelim.sek.month.99')
    localStorage.setItem('plan_id', 'plan.prelim.sek.month.99')
    mockComparison({ comparison, ok: true })
    const { container } = render(<PlanComparison isAuthenticated />)

    const summary = await screen.findByText('Jämför abonnemang')
    const details = summary.closest('details')
    expect(details.open).toBe(false)
    fireEvent.click(summary)
    expect(details.open).toBe(true)
    const prices = screen.getAllByText(/kr\/mån$|^Gratis$/)
    expect(prices.map(node => node.textContent)).toEqual(['Gratis', '12 kr/mån'])
    expect(card('Gratis').getByText('Din plan')).toBeTruthy()
    expect(card('Gratis').getByText('5')).toBeTruthy()
    expect(card('12 kr/mån').getByText('30')).toBeTruthy()

    expect(screen.getByText('Vänchatt')).toBeTruthy()
    expect(screen.getByText('Röstinmatning')).toBeTruthy()
    expect(screen.getByText('Uppläsning')).toBeTruthy()
    expect(screen.getByText('GPS/platsdelning')).toBeTruthy()
    expect(screen.getByText('GPS Live')).toBeTruthy()
    expect(screen.getByText('SOS/trygghetsfunktioner')).toBeTruthy()
    expect(screen.getByText('AI-Örat')).toBeTruthy()
    expect(screen.getAllByText('Obegränsat')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /köp|välj|uppgradera|byt plan/i })).toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/plan\.free|plan\.prelim|ai\.text\.request|food\.scan|body\.scan|ai\.eye\.analysis|tts\.request|gps_standard|ready_avatar|smart_ai/)
    expect(screen.queryByText('99 kr')).toBeNull()
  })

  it('shows an incomplete plan without a client fallback quota', async () => {
    mockComparison({
      comparison: {
        plans: [{
          complimentary: false,
          complete: false,
          current: false,
          forSale: false,
          name: '99 kr',
          priceText: '99 kr/mån',
          quotas: [{ key: 'ai_coach', limit: 20 }],
          unlimited: [],
        }],
      },
      ok: true,
    })
    render(<PlanComparison isAuthenticated />)
    fireEvent.click(await screen.findByText('Jämför abonnemang'))
    expect(screen.getByText('Kvoten kunde inte visas.')).toBeTruthy()
    expect(screen.queryByText('20')).toBeNull()
    expect(screen.queryByText('1 500')).toBeNull()
    expect(screen.getByText('Kommer snart')).toBeTruthy()
  })

  it('sends the 12 kr plan to the SumUp hosted checkout page', async () => {
    const plan = {
      ...comparison.plans.find((row) => row.priceText === '12 kr/mån'),
      forSale: true,
      offerKey: 'sek-1200',
    }
    getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } } })
    openHostedCheckout.mockClear()
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url) === '/api/billing/checkout') {
        return {
          json: async () => ({ hostedCheckoutUrl: 'https://checkout.sumup.com/pay/page-1' }),
          ok: true,
          status: 202,
        }
      }
      return { json: async () => ({ comparison: { plans: [plan] }, ok: true }), ok: true, status: 200 }
    }))
    render(<PlanComparison isAuthenticated />)
    fireEvent.click(await screen.findByText('Jämför abonnemang'))
    fireEvent.click(await screen.findByRole('button', { name: 'Betala en gång – 30 dagar, ingen förnyelse' }))
    await waitFor(() => {
      expect(openHostedCheckout).toHaveBeenCalledWith('https://checkout.sumup.com/pay/page-1')
    })
    const checkoutCall = vi.mocked(fetch).mock.calls.find((call) => call[0] === '/api/billing/checkout')
    expect(JSON.parse(checkoutCall[1].body)).toEqual({ offer_key: 'sek-1200', payment_mode: 'one_time' })
    expect(checkoutCall[1].headers.Authorization).toBe('Bearer session-token')
  })

  it('keeps a sale flag from adding a purchase action', async () => {
    mockComparison({
      comparison: {
        plans: [{
          ...comparison.plans.find((plan) => plan.priceText === '12 kr/mån'),
          forSale: true,
        }],
      },
      ok: true,
    })
    render(<PlanComparison isAuthenticated />)
    fireEvent.click(await screen.findByText('Jämför abonnemang'))
    expect(screen.getByText('Tillgänglig')).toBeTruthy()
    expect(screen.queryByText('Kommer snart')).toBeNull()
    expect(screen.queryByRole('button', { name: /köp|välj|uppgradera|byt plan/i })).toBeNull()
  })

  it('stays safe when signed out or the server fails', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { rerender } = render(<PlanComparison isAuthenticated={false} />)
    fireEvent.click(screen.getByText('Jämför abonnemang'))
    expect(screen.getByText('Logga in för att jämföra abonnemang.')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()

    mockComparison({ ok: false }, false)
    rerender(<PlanComparison isAuthenticated />)
    fireEvent.click(screen.getByText('Jämför abonnemang'))
    expect(await screen.findByText('Jämförelsen kunde inte hämtas just nu.')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByText('Gratis')).toBeNull()
    })
  })

  it('does not embed a second quota matrix and stays inside the page width', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'PlanComparison.jsx'), 'utf8')
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'PlanComparison.css'), 'utf8')
    expect(source).not.toMatch(/LAUNCH_QUOTA|1500|1250/)
    expect(css).toMatch(/overflow-x:\s*hidden/)
    expect(css).toMatch(/max-width:\s*100%/)
    expect(css).toMatch(/minmax\(0, 1fr\)/)
  })
})
