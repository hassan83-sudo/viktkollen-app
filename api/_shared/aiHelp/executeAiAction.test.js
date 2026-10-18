import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAiActionsForTests, recentAiActions, recordAiAction } from './actionAudit.js'
import { executeConfirmedAiAction } from './executeAiAction.js'

afterEach(() => clearAiActionsForTests())

describe('confirmed AI actions', () => {
  it('rejects an invented action before billing runs', async () => {
    const execute = vi.fn()
    const result = await executeConfirmedAiAction({
      actionId: 'email_change',
      actorUserId: 'user-1',
      confirmed: true,
      execute,
    })
    expect(result).toMatchObject({ code: 'UNKNOWN_ACTION', ok: false, status: 400 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('requires an explicit confirmation for cancellation', async () => {
    const execute = vi.fn()
    const result = await executeConfirmedAiAction({
      actionId: 'schedule_cancel',
      actorUserId: 'user-1',
      confirmed: false,
      execute,
    })
    expect(result.code).toBe('CONFIRMATION_REQUIRED')
    expect(execute).not.toHaveBeenCalled()
  })

  it('runs cancellation only for the authenticated user and logs no secrets', async () => {
    const execute = vi.fn(async () => ({ ok: true, status: 200 }))
    const result = await executeConfirmedAiAction({
      actionId: 'schedule_cancel',
      actorUserId: 'user-1',
      confirmed: true,
      execute,
    })
    expect(result).toMatchObject({ action: 'schedule_cancel', code: 'completed', ok: true, status: 200 })
    expect(execute).toHaveBeenCalledWith({ action: 'schedule_cancel', body: {}, userId: 'user-1' })
    const logged = JSON.stringify(recentAiActions())
    expect(logged).not.toMatch(/password|Bearer|user-1|4242|card/i)
    expect(recentAiActions()[0]).toMatchObject({ action: 'schedule_cancel', code: 'completed', ok: true })
  })

  it('logs only the action, result code and actor hash', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const saved = recordAiAction({
      action: 'schedule_cancel',
      actorUserId: 'user-1',
      code: 'completed',
      ok: true,
      password: 'hunter2',
      token: 'Bearer secret',
      message: 'card 4242',
    })
    expect(Object.keys(saved).sort()).toEqual(['action', 'actorHash', 'code', 'ok'])
    expect(saved.actorHash).not.toContain('user-1')
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/hunter2|Bearer|4242|user-1/)
    info.mockRestore()
  })

  it('requires confirmation before a plan change or undoing cancellation', async () => {
    const execute = vi.fn()
    for (const actionId of ['plan_change', 'undo_cancel']) {
      const result = await executeConfirmedAiAction({
        actionId,
        actorUserId: 'user-1',
        confirmed: false,
        planId: 'plan.prelim.sek.month.07',
        execute,
      })
      expect(result.code).toBe('CONFIRMATION_REQUIRED')
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('schedules a plan change only with the authenticated user and the named plan', async () => {
    const execute = vi.fn(async () => ({ ok: true, status: 200 }))
    const result = await executeConfirmedAiAction({
      actionId: 'plan_change',
      actorUserId: 'user-1',
      confirmed: true,
      planId: 'plan.prelim.sek.month.07',
      price_minor: 100,
      userId: 'other-user',
      execute,
    })
    expect(result).toMatchObject({ action: 'plan_change', code: 'completed', ok: true, status: 200 })
    expect(execute).toHaveBeenCalledWith({
      action: 'plan_change',
      body: { plan_id: 'plan.prelim.sek.month.07' },
      userId: 'user-1',
    })
    expect(JSON.stringify(recentAiActions())).not.toMatch(/plan\.prelim|100|other-user|user-1/)
  })

  it('rejects a free, blank or foreign plan before billing runs', async () => {
    const execute = vi.fn()
    for (const planId of ['plan.free', '', 'plan id with spaces', 'plan/checkout']) {
      const result = await executeConfirmedAiAction({
        actionId: 'plan_change',
        actorUserId: 'user-1',
        confirmed: true,
        planId,
        execute,
      })
      expect(result).toMatchObject({ code: 'UNKNOWN_ACTION', ok: false, status: 400 })
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('undoes a scheduled cancellation without a payment body', async () => {
    const execute = vi.fn(async () => ({ ok: true, status: 200 }))
    const result = await executeConfirmedAiAction({
      actionId: 'undo_cancel',
      actorUserId: 'user-1',
      confirmed: true,
      planId: 'plan.prelim.sek.month.07',
      execute,
    })
    expect(result).toMatchObject({ action: 'undo_cancel', code: 'completed', ok: true })
    expect(execute).toHaveBeenCalledWith({ action: 'undo_cancel', body: {}, userId: 'user-1' })
  })

  it('keeps a cancellation call free of a smuggled plan id', async () => {
    const execute = vi.fn(async () => ({ ok: true, status: 200 }))
    await executeConfirmedAiAction({
      actionId: 'schedule_cancel',
      actorUserId: 'user-1',
      confirmed: true,
      planId: 'plan.prelim.sek.month.07',
      execute,
    })
    expect(execute).toHaveBeenCalledWith({ action: 'schedule_cancel', body: {}, userId: 'user-1' })
  })

  it('returns the billing refusal when the plan is not for sale', async () => {
    const execute = vi.fn(async () => ({ code: 'INVALID_PLAN', ok: false, status: 400 }))
    const result = await executeConfirmedAiAction({
      actionId: 'plan_change',
      actorUserId: 'user-1',
      confirmed: true,
      planId: 'plan.not-for-sale',
      execute,
    })
    expect(result).toMatchObject({ action: 'plan_change', code: 'INVALID_PLAN', ok: false, status: 400 })
  })

  it('opens only an official hosted checkout and ignores card data', async () => {
    const checkout = vi.fn(async () => ({
      code: 'CHECKOUT_PENDING',
      hostedCheckoutUrl: 'https://checkout.sumup.com/pay/safePage',
      ok: false,
      status: 202,
    }))
    const execute = vi.fn()
    const result = await executeConfirmedAiAction({
      actionId: 'hosted_checkout',
      actorUserId: 'user-1',
      cardNumber: '4242424242424242',
      checkout,
      confirmed: true,
      execute,
      planId: 'plan.prelim.sek.month.07',
      userId: 'other-user',
    })
    expect(result).toMatchObject({
      action: 'hosted_checkout',
      code: 'CHECKOUT_PENDING',
      hostedCheckoutUrl: 'https://checkout.sumup.com/pay/safePage',
      ok: true,
      status: 202,
    })
    expect(checkout).toHaveBeenCalledWith({ body: { plan_id: 'plan.prelim.sek.month.07' }, userId: 'user-1' })
    expect(execute).not.toHaveBeenCalled()
    expect(JSON.stringify(recentAiActions())).not.toMatch(/safePage|4242|other-user|user-1/)
  })

  it('blocks a refund, a stored-card retry and an unofficial payment page', async () => {
    const checkout = vi.fn(async () => ({
      code: 'CHECKOUT_PENDING',
      hostedCheckoutUrl: 'https://evil.example/pay/1',
      status: 202,
    }))
    const execute = vi.fn()
    const refund = await executeConfirmedAiAction({
      actionId: 'refund',
      actorUserId: 'user-1',
      checkout,
      confirmed: true,
      execute,
    })
    expect(refund).toMatchObject({ code: 'UNKNOWN_ACTION', ok: false })
    const unconfirmed = await executeConfirmedAiAction({
      actionId: 'hosted_checkout',
      actorUserId: 'user-1',
      checkout,
      confirmed: false,
      planId: 'plan.prelim.sek.month.07',
    })
    expect(unconfirmed.code).toBe('CONFIRMATION_REQUIRED')
    const unsafe = await executeConfirmedAiAction({
      actionId: 'hosted_checkout',
      actorUserId: 'user-1',
      checkout,
      confirmed: true,
      planId: 'plan.prelim.sek.month.07',
    })
    expect(unsafe).toMatchObject({ code: 'CHECKOUT_UNAVAILABLE', ok: false })
    expect(unsafe.hostedCheckoutUrl).toBeUndefined()
    expect(checkout).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    const blocked = await executeConfirmedAiAction({
      actionId: 'hosted_checkout',
      actorUserId: 'user-1',
      checkout: vi.fn(async () => ({ code: 'PROVIDER_NOT_CONFIGURED', status: 503 })),
      confirmed: true,
      planId: 'plan.prelim.sek.month.07',
    })
    expect(blocked).toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED', ok: false, status: 503 })
  })

  it('resets the verified email and deletes only the authenticated account', async () => {
    const passwordReset = vi.fn(async ({ email }) => {
      expect(email).toBe('owner@example.test')
      return { code: 'RESET_EMAIL_SENT', ok: true, status: 200 }
    })
    const deleteAccount = vi.fn()
    const reset = await executeConfirmedAiAction({
      accountEmail: 'owner@example.test',
      actionId: 'password_reset',
      actorUserId: 'user-1',
      confirmed: true,
      deleteAccount,
      email: 'other@example.test',
      password: 'hunter2',
      passwordReset,
      token: 'reset-code',
    })
    expect(reset).toMatchObject({ action: 'password_reset', code: 'RESET_EMAIL_SENT', ok: true })
    expect(deleteAccount).not.toHaveBeenCalled()
    expect(JSON.stringify(recentAiActions())).not.toMatch(/hunter2|reset-code|owner@example|other@example|user-1/)

    const unconfirmed = await executeConfirmedAiAction({
      actionId: 'delete_account',
      actorUserId: 'user-1',
      confirmed: false,
      deleteAccount,
    })
    expect(unconfirmed.code).toBe('CONFIRMATION_REQUIRED')
    expect(deleteAccount).not.toHaveBeenCalled()

    deleteAccount.mockResolvedValue({ code: 'ACCOUNT_DELETE_BLOCKED', ok: false, status: 409 })
    const blockedDelete = await executeConfirmedAiAction({
      actionId: 'delete_account',
      actorUserId: 'user-1',
      confirmed: true,
      deleteAccount,
      password: 'hunter2',
      userId: 'other-user',
    })
    expect(blockedDelete).toMatchObject({ code: 'ACCOUNT_DELETE_BLOCKED', ok: false, status: 409 })
    expect(deleteAccount).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(await executeConfirmedAiAction({
      actionId: 'email_change',
      actorUserId: 'user-1',
      confirmed: true,
      deleteAccount,
      passwordReset,
    })).toMatchObject({ code: 'UNKNOWN_ACTION', ok: false })
    expect(await executeConfirmedAiAction({
      actionId: 'profile_update',
      actorUserId: 'user-1',
      confirmed: true,
    })).toMatchObject({ code: 'UNKNOWN_ACTION', ok: false })
    expect(await executeConfirmedAiAction({
      actionId: 'quota_reset',
      actorUserId: 'user-1',
      confirmed: true,
    })).toMatchObject({ code: 'UNKNOWN_ACTION', ok: false })
    expect(await executeConfirmedAiAction({
      actionId: 'camera_fix',
      actorUserId: 'user-1',
      confirmed: true,
    })).toMatchObject({ code: 'UNKNOWN_ACTION', ok: false })
  })
})
