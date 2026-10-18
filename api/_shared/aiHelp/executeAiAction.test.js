import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAiActionsForTests, recentAiActions } from './actionAudit.js'
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
})
