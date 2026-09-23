/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlanUsagePanel from './PlanUsagePanel.jsx'

const getSession = vi.fn()

vi.mock('../../services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
    },
  },
}))

const snapshot = {
  period: { end: '2026-10-01T00:00:00.000Z' },
  plan: { name: 'Gratis', priceText: '0 kr/mån' },
  quotas: [
    { key: 'ai_coach', limit: 20, remaining: 16, used: 4 },
    { key: 'food_scan', limit: 5, remaining: 3, used: 2 },
    { key: 'body_scan', limit: 3, remaining: 2, used: 1 },
    { key: 'ai_eye', limit: 25, remaining: 18, used: 7 },
    { key: 'not_a_feature', limit: 1, remaining: 1, used: 0 },
  ],
  unlimited: [
    { key: 'friend_chat' },
    { key: 'voice_input' },
    { key: 'speech' },
    { key: 'gps' },
    { key: 'gps_live' },
    { key: 'sos' },
    { key: 'ai_ear' },
    { key: 'ready_avatar' },
  ],
}

function mockSnapshot(body, ok = true) {
  getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } } })
  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => body,
    ok,
    status: ok ? 200 : 503,
  })))
}

describe('PlanUsagePanel', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows the server snapshot, reset date, and unlimited features without a purchase action', async () => {
    localStorage.setItem('viktkollen.plan', 'plan.prelim.sek.month.99')
    localStorage.setItem('plan_id', 'plan.prelim.sek.month.99')
    mockSnapshot({ ok: true, snapshot })
    const { container } = render(<PlanUsagePanel isAuthenticated />)

    expect(await screen.findByText('AI-coach')).toBeTruthy()
    expect(screen.getByText('4 av 20 använda')).toBeTruthy()
    expect(screen.getByText('16 kvar')).toBeTruthy()
    expect(screen.getByText('2 av 5 använda')).toBeTruthy()
    expect(screen.getByText('3 kvar')).toBeTruthy()
    expect(screen.getByText('1 av 3 använda')).toBeTruthy()
    expect(screen.getByText('2 kvar')).toBeTruthy()
    expect(screen.getByText('7 av 25 använda')).toBeTruthy()
    expect(screen.getByText('18 kvar')).toBeTruthy()
    expect(screen.getByText('Gratis')).toBeTruthy()
    expect(screen.getByText('0 kr/mån')).toBeTruthy()
    expect(screen.getByText('Återställs 1 oktober')).toBeTruthy()
    expect(screen.getByText('Ingår utan användningsgräns')).toBeTruthy()
    expect(screen.getAllByText('Obegränsat')).toHaveLength(7)
    expect(screen.getByText('Vänchatt')).toBeTruthy()
    expect(screen.getByText('Röstinmatning')).toBeTruthy()
    expect(screen.getByText('Uppläsning')).toBeTruthy()
    expect(screen.getByText('GPS/platsdelning')).toBeTruthy()
    expect(screen.getByText('GPS Live')).toBeTruthy()
    expect(screen.getByText('SOS/trygghetsfunktioner')).toBeTruthy()
    expect(screen.getByText('AI-Örat')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /köp/i })).toBeNull()
    expect(screen.queryByText('99 kr/mån')).toBeNull()
    expect(container.textContent).not.toMatch(/ai\.text\.request|food\.scan|body\.scan|ai\.eye\.analysis|tts\.request|gps_standard|ready_avatar|smart_ai/)
    expect(container.querySelector('.plan-usage').scrollWidth).toBeLessThanOrEqual(390)
  })

  it('shows zero usage and an exhausted quota without a negative remainder', async () => {
    mockSnapshot({
      ok: true,
      snapshot: {
        ...snapshot,
        quotas: [
          { key: 'ai_coach', limit: 20, remaining: -4, used: 0 },
          { key: 'food_scan', limit: 5, remaining: 0, used: 5 },
        ],
      },
    })
    render(<PlanUsagePanel isAuthenticated />)
    expect(await screen.findByText('0 av 20 använda')).toBeTruthy()
    expect(screen.getAllByText(/0 kvar/).length).toBeGreaterThan(0)
    expect(screen.getByText('5 av 5 använda')).toBeTruthy()
    expect(screen.getAllByText(/0 kvar\. Kvoten är slut/)).toHaveLength(2)
    expect(screen.queryByText(/-\d+ kvar/)).toBeNull()
  })

  it('stays safe when signed out or the server fails', async () => {
    const { rerender } = render(<PlanUsagePanel isAuthenticated={false} />)
    expect(screen.getByText('Logga in för att se abonnemang och användning.')).toBeTruthy()

    mockSnapshot({ ok: false }, false)
    rerender(<PlanUsagePanel isAuthenticated />)
    expect(await screen.findByText('Abonnemanget kunde inte hämtas just nu.')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByText('AI-coach')).toBeNull()
    })
  })

  it('keeps the usage panel inside a 390 px width', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'PlanUsagePanel.css'), 'utf8')
    expect(css).toMatch(/overflow-x:\s*hidden/)
    expect(css).toMatch(/max-width:\s*100%/)
  })
})
