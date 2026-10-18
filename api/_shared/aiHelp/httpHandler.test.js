import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { answerAiHelpQuestion } from './service.js'
import { handleAiHelpRequest } from './httpHandler.js'
import { executeConfirmedAiAction } from './executeAiAction.js'

vi.mock('../verifySupabaseUser.js', () => ({
  verifySupabaseUser: vi.fn(),
}))

vi.mock('./service.js', () => ({
  answerAiHelpQuestion: vi.fn(),
}))

vi.mock('./executeAiAction.js', () => ({
  executeConfirmedAiAction: vi.fn(),
}))

function responseDouble() {
  return {
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code
      return this
    },
    statusCode: 0,
    json(body) {
      this.body = body
      return this
    },
  }
}

describe('AI Help authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not read personal billing data for an unauthenticated request', async () => {
    verifySupabaseUser.mockResolvedValue({
      authenticated: false,
      error: { code: 'AUTH_REQUIRED' },
      status: 401,
    })
    const response = responseDouble()
    await handleAiHelpRequest({
      body: { messages: [{ content: 'Vilket abonnemang har jag?', role: 'user' }], user_id: 'user-b' },
      method: 'POST',
    }, response)
    expect(answerAiHelpQuestion).not.toHaveBeenCalled()
    expect(response.statusCode).toBe(401)
    expect(JSON.stringify(response.body)).not.toContain('plan')
  })

  it('passes only the authenticated user id into the help service', async () => {
    verifySupabaseUser.mockResolvedValue({ authenticated: true, user: { id: 'user-a' } })
    answerAiHelpQuestion.mockResolvedValue({
      answer: 'Aktivt.',
      featureIds: [],
      language: { code: 'sv' },
      ok: true,
      source: 'verified-customer',
      status: 'answered',
    })
    const response = responseDouble()
    await handleAiHelpRequest({
      body: { messages: [{ content: 'Vilket abonnemang har jag?', role: 'user' }], user_id: 'user-b' },
      method: 'POST',
    }, response)
    expect(answerAiHelpQuestion).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a' }))
    expect(answerAiHelpQuestion.mock.calls[0][0].body.user_id).toBe('user-b')
    expect(answerAiHelpQuestion.mock.calls[0][0].userId).toBe('user-a')
  })

  it('confirms only a registered action for the authenticated user', async () => {
    verifySupabaseUser.mockResolvedValue({ authenticated: true, user: { id: 'user-a' } })
    executeConfirmedAiAction.mockResolvedValue({ action: 'schedule_cancel', code: 'completed', ok: true, status: 200 })
    const response = responseDouble()
    await handleAiHelpRequest({
      body: {
        confirmAction: 'schedule_cancel',
        confirmed: true,
        messages: [{ content: 'password hunter2', role: 'user' }],
        tool: { name: 'delete-account' },
        user_id: 'user-b',
      },
      method: 'POST',
    }, response)
    expect(answerAiHelpQuestion).not.toHaveBeenCalled()
    expect(executeConfirmedAiAction).toHaveBeenCalledWith({
      actionId: 'schedule_cancel',
      actorUserId: 'user-a',
      confirmed: true,
      planId: undefined,
      accountEmail: '',
    })
    expect(JSON.stringify(response.body)).not.toMatch(/hunter2|user-b|delete-account/)
  })

  it('returns only an official hosted checkout page', async () => {
    verifySupabaseUser.mockResolvedValue({ authenticated: true, user: { id: 'user-a' } })
    executeConfirmedAiAction.mockResolvedValue({
      action: 'hosted_checkout',
      code: 'CHECKOUT_PENDING',
      hostedCheckoutUrl: 'https://checkout.sumup.com.evil/pay/abc',
      ok: true,
      status: 202,
    })
    const response = responseDouble()
    await handleAiHelpRequest({
      body: { confirmAction: 'hosted_checkout', confirmed: true, planId: 'plan.prelim.sek.month.07', cardNumber: '4242424242424242' },
      method: 'POST',
    }, response)
    expect(response.body.hostedCheckoutUrl).toBeUndefined()
    expect(JSON.stringify(response.body)).not.toMatch(/4242|evil/)
    executeConfirmedAiAction.mockResolvedValue({
      action: 'hosted_checkout',
      code: 'CHECKOUT_PENDING',
      hostedCheckoutUrl: 'https://checkout.sumup.com/pay/safePage',
      ok: true,
      status: 202,
    })
    const allowed = responseDouble()
    await handleAiHelpRequest({
      body: { confirmAction: 'hosted_checkout', confirmed: true, planId: 'plan.prelim.sek.month.07' },
      method: 'POST',
    }, allowed)
    expect(allowed.body.hostedCheckoutUrl).toBe('https://checkout.sumup.com/pay/safePage')
    expect(allowed.body.ok).toBe(true)
  })
})
