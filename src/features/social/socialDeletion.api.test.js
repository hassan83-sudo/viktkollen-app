import { describe, expect, it, vi } from 'vitest'
import { accountDeletionRouteInternals } from '../../../api/account-deletion/index.js'

describe('account deletion social purge', () => {
  it('calls purge_account_user_data once and does not invoke the old social purge rpc', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const from = vi.fn()
    const results = await accountDeletionRouteInternals.deleteRowsForUser({ from, rpc }, 'user-1')

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('purge_account_user_data', { p_user_id: 'user-1' })
    expect(rpc).not.toHaveBeenCalledWith('social_purge_user_data', { p_user_id: 'user-1' })
    expect(from).not.toHaveBeenCalled()
    expect(results).toEqual([
      expect.objectContaining({ area: 'account', ok: true, table: 'purge_account_user_data' }),
    ])
    expect(accountDeletionRouteInternals.accountPurgeRpc).toBe('purge_account_user_data')
  })
})
