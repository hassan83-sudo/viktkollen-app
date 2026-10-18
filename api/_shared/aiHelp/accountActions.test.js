import { describe, expect, it, vi } from 'vitest'
import { deleteVerifiedAccount, publicAuthAccount, sendVerifiedPasswordReset } from './accountActions.js'

describe('verified account actions', () => {
  it('sends a reset to the verified email and drops the provider payload', async () => {
    const reset = vi.fn(async () => ({ data: { action_link: 'https://example.test/reset-code' }, error: null }))
    const sent = await sendVerifiedPasswordReset({ email: 'owner@example.test', reset })
    expect(sent).toEqual({ code: 'RESET_EMAIL_SENT', ok: true, status: 200 })
    expect(reset).toHaveBeenCalledWith('owner@example.test')
    expect(JSON.stringify(sent)).not.toMatch(/reset-code|action_link/)

    const missing = await sendVerifiedPasswordReset({ email: 'not-an-email', reset })
    expect(missing).toMatchObject({ code: 'ACCOUNT_EMAIL_UNAVAILABLE', ok: false })
    expect(reset).toHaveBeenCalledTimes(1)
    expect(publicAuthAccount({ email: 'owner@example.test', recovery_token: 'reset-code' })).toEqual({
      createdAt: '',
      email: 'owner@example.test',
      emailConfirmed: false,
    })
  })

  it('uses the existing deletion flow and keeps a disabled auth delete blocked', async () => {
    const deleteAuth = vi.fn(async () => ({ blocked: true, ok: false, reason: 'auth_delete_disabled' }))
    const deleteRows = vi.fn(async (userId) => {
      expect(userId).toBe('user-1')
      return [{ ok: true, table: 'purge_account_user_data' }]
    })
    const blocked = await deleteVerifiedAccount({ deleteAuth, deleteRows, userId: 'user-1' })
    expect(blocked).toEqual({ code: 'ACCOUNT_DELETE_BLOCKED', ok: false, status: 409 })
    expect(JSON.stringify(blocked)).not.toMatch(/purge_account_user_data|auth_delete_disabled/)

    const failedRows = vi.fn(async () => [{ ok: false, table: 'secret_table' }])
    const skipped = await deleteVerifiedAccount({ deleteAuth, deleteRows: failedRows, userId: 'user-1' })
    expect(skipped.code).toBe('ACCOUNT_DELETE_FAILED')
    expect(deleteAuth).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(skipped)).not.toMatch(/secret_table/)

    deleteAuth.mockResolvedValueOnce({ ok: true })
    const removed = await deleteVerifiedAccount({ deleteAuth, deleteRows, userId: 'user-1' })
    expect(removed).toEqual({ code: 'ACCOUNT_DELETED', ok: true, status: 200 })
  })
})
