/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPlanComparison } from '../../services/billing/planComparison.js'
import { defaultPlanCatalog } from '../../services/billing/planCatalog.js'
import PlanComparison from './PlanComparison.jsx'

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
    expect(prices.map((node) => node.textContent)).toEqual([
      'Gratis',
      '4 kr/mån',
      '7 kr/mån',
      '9 kr/mån',
      '12 kr/mån',
      '15 kr/mån',
      '19 kr/mån',
      '29 kr/mån',
      '39 kr/mån',
      '49 kr/mån',
      '59 kr/mån',
      '69 kr/mån',
      '79 kr/mån',
      '89 kr/mån',
      '99 kr/mån',
    ])
    expect(screen.getAllByText('Kommer snart')).toHaveLength(14)
    expect(screen.getByText('Din plan')).toBeTruthy()
    expect(card('Gratis').getByText('Din plan')).toBeTruthy()
    expect(card('Gratis').getByText('20')).toBeTruthy()
    expect(card('Gratis').getByText('5')).toBeTruthy()
    expect(card('Gratis').getByText('3')).toBeTruthy()
    expect(card('Gratis').getByText('25')).toBeTruthy()

    expect(card('9 kr/mån').getByText('70')).toBeTruthy()
    expect(card('9 kr/mån').getByText('20')).toBeTruthy()
    expect(card('9 kr/mån').getByText('8')).toBeTruthy()
    expect(card('9 kr/mån').getByText('80')).toBeTruthy()

    expect(card('49 kr/mån').getAllByText('500')).toHaveLength(2)
    expect(card('49 kr/mån').getByText('160')).toBeTruthy()
    expect(card('49 kr/mån').getByText('50')).toBeTruthy()

    expect(card('79 kr/mån').getAllByText('1 000')).toHaveLength(2)
    expect(card('89 kr/mån').getAllByText('1 250')).toHaveLength(2)
    expect(card('99 kr/mån').getAllByText('1 500')).toHaveLength(2)
    expect(card('99 kr/mån').getByText('400')).toBeTruthy()
    expect(card('99 kr/mån').getByText('150')).toBeTruthy()

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

  it('keeps a sale flag from adding a purchase action', async () => {
    mockComparison({
      comparison: {
        plans: [{
          ...comparison.plans.find((plan) => plan.priceText === '4 kr/mån'),
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
