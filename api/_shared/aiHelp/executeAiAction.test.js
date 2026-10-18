import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAiActionsForTests, recentAiActions, recordAiAction } from './actionAudit.js'
import { executeConfirmedAiAction } from './executeAiAction.js'

afterEach(() => clearAiActionsForTests())

describe('confirmed AI actions', () => {
  it('rejects an invented action before billing runs', async () => {
    const execute = vi.fn()
    const result = await executeConfirmedAiAction({
      actionId: 'delete_account',
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
})
