import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from '../../services/ai/aiAuthTransport.js'
import { confirmAiAction, confirmScheduleCancel, requestAiHelpReply } from './aiHelpClient.js'

vi.mock('../../services/ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(),
  hasSameAiAuthUser: vi.fn(),
}))

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

describe('AI Help account boundaries', () => {
  it('discards a private reply after the signed-in account changes', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: true, userScope: 'first', authorizationHeader: 'Bearer first' })
    hasSameAiAuthUser.mockResolvedValue(false)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, answer: 'Private plan facts' }) })))
    expect(await requestAiHelpReply()).toEqual({ code: 'AUTH_STALE', ok: false })
  })

  it('never sends an old account cancellation using the new account token', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: true, userScope: 'second', authorizationHeader: 'Bearer second' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await confirmScheduleCancel('first')).toEqual({ code: 'AUTH_STALE', ok: false })
    expect(await confirmScheduleCancel()).toEqual({ code: 'AUTH_STALE', ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires login before requesting help or changing billing', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: false, errorCode: 'AUTH_REQUIRED' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await requestAiHelpReply()).code).toBe('AUTH_REQUIRED')
    expect((await confirmScheduleCancel('first')).code).toBe('AUTH_REQUIRED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends only the confirmed plan id and drops invented billing actions', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: true, userScope: 'first', authorizationHeader: 'Bearer first' })
    hasSameAiAuthUser.mockResolvedValue(true)
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, answer: 'Väntar på bekräftelse.', confirmation: { action: 'plan_change', planId: 'plan.prelim.sek.month.07', price_minor: 1 } }) }))
    vi.stubGlobal('fetch', fetchMock)
    const reply = await requestAiHelpReply({ messages: [{ content: 'Byt mitt abonnemang', role: 'user' }] })
    expect(reply.confirmation).toEqual({ action: 'plan_change', planId: 'plan.prelim.sek.month.07', userScope: 'first' })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, action: 'plan_change' }) })
    expect(await confirmAiAction('first', reply.confirmation)).toEqual({ code: '', hostedCheckoutUrl: '', ok: true, subscription: null })
    const body = JSON.parse(fetchMock.mock.calls.at(-1)[1].body)
    expect(body).toEqual({ confirmAction: 'plan_change', confirmed: true, planId: 'plan.prelim.sek.month.07' })
    expect(JSON.stringify(body)).not.toMatch(/price|Byt mitt/)
    expect(await confirmAiAction('first', { action: 'checkout', planId: 'plan.prelim.sek.month.07' })).toEqual({ code: 'UNKNOWN_ACTION', ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps only an official SumUp page and never sends card data', async () => {
    getCurrentAiAuthorization.mockResolvedValue({ ok: true, userScope: 'first', authorizationHeader: 'Bearer first' })
    hasSameAiAuthUser.mockResolvedValue(true)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 'CHECKOUT_PENDING', hostedCheckoutUrl: 'https://evil.example/pay/1', ok: true }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const blocked = await confirmAiAction('first', { action: 'hosted_checkout', planId: 'plan.prelim.sek.month.07' })
    expect(blocked.hostedCheckoutUrl).toBe('')
    expect(JSON.stringify(fetchMock.mock.calls[0][1].body)).not.toMatch(/4242|card/)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 'CHECKOUT_PENDING', hostedCheckoutUrl: 'https://checkout.sumup.com/pay/safePage', ok: true }),
    })
    const ready = await confirmAiAction('first', { action: 'hosted_checkout', planId: 'plan.prelim.sek.month.07', card: '4242424242424242' })
    expect(ready.hostedCheckoutUrl).toBe('https://checkout.sumup.com/pay/safePage')
    expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body)).toEqual({
      confirmAction: 'hosted_checkout',
      confirmed: true,
      planId: 'plan.prelim.sek.month.07',
    })
  })
})
