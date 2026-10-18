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
})
