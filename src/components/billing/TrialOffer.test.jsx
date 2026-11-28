/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TrialOffer from './TrialOffer.jsx'

vi.mock('../../services/ai/aiAuthTransport.js', () => ({ getCurrentAiAuthorization: async () => ({ ok: true, authorizationHeader: 'Bearer verified', userScope: 'account' }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('explicit trial offer', () => {
  it('starts only on click, never sends payment details, and refreshes access after success', async () => {
    const onStarted = vi.fn()
    const fetcher = vi.fn(async (_url, init = {}) => ({ ok: true, json: async () => init.method === 'POST' ? { ok: true } : { trial: { eligible: true } } }))
    vi.stubGlobal('fetch', fetcher)
    render(<TrialOffer onStarted={onStarted} />)
    const button = await screen.findByRole('button', { name: 'Starta 30 dagar gratis' })
    expect(fetcher.mock.calls.every(([, init]) => init.method !== 'POST')).toBe(true)
    expect(screen.getByText(/Inga betalningsuppgifter/)).toBeTruthy()
    fireEvent.click(button)
    await waitFor(() => expect(onStarted).toHaveBeenCalledOnce())
    const post = fetcher.mock.calls.find(([, init]) => init.method === 'POST')
    expect(post[0]).toBe('/api/billing/trial')
    expect(post[1]).toEqual({ method: 'POST', headers: { Authorization: 'Bearer verified' } })
    expect(await screen.findByText(/Din provperiod har startat/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('hides the action for an account that has already used its trial', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ trial: { eligible: false, used: true } }) })))
    render(<TrialOffer />)
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('shows the server conflict and does not grant local access', async () => {
    const onStarted = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (_url, init = {}) => ({ ok: init.method !== 'POST', json: async () => init.method === 'POST' ? { error: { code: 'TRIAL_ALREADY_USED' } } : { trial: { eligible: true } } })))
    render(<TrialOffer onStarted={onStarted} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Starta 30 dagar gratis' }))
    expect(await screen.findByText('Det här kontot har redan använt sin provperiod.')).toBeTruthy()
    expect(onStarted).not.toHaveBeenCalled()
  })
})
