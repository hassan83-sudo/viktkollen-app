import { describe, expect, it, vi } from 'vitest'
import { accountDeletionRouteInternals } from '../../../api/account-deletion/index.js'

describe('account deletion social purge', () => {
  it('calls social_purge_user_data before deleting other user-owned rows', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const from = vi.fn((table) => ({
      delete: () => ({
        eq: async () => ({ error: null, table }),
      }),
    }))
    const client = { from, rpc }
    const results = await accountDeletionRouteInternals.deleteRowsForUser(client, 'user-1')

    expect(rpc).toHaveBeenCalledWith('social_purge_user_data', { p_user_id: 'user-1' })
    expect(results[0]).toMatchObject({ area: 'social', ok: true, table: 'social_purge_user_data' })
    expect(accountDeletionRouteInternals.socialPurgeRpc).toBe('social_purge_user_data')
  })
})
