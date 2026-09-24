import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './index.js'
import { clearSupabaseAdminClientForTests, setSupabaseAdminClientForTests } from '../_shared/supabaseServer.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

function createRequest({ body = {}, method = 'POST', token = 'valid-token' } = {}) {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
  }
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json: vi.fn((body) => {
      response.body = body
      return response
    }),
    setHeader: vi.fn((name, value) => {
      response.headers[name] = value
    }),
    status: vi.fn((statusCode) => {
      response.statusCode = statusCode
      return response
    }),
  }

  return response
}

function createDeletionClient({ failTable = '', failRpc = '', failRpcCode = 'purge_failed', authError = null } = {}) {
  const deletedTables = []

  return {
    auth: {
      admin: {
        deleteUser: vi.fn(async () => ({ error: authError })),
      },
    },
    deletedTables,
    from: vi.fn((table) => ({
      delete: vi.fn(() => ({
        eq: vi.fn(async (column, userId) => {
          deletedTables.push({ column, table, userId })
          return { error: table === failTable ? { code: 'permission_denied' } : null }
        }),
      })),
    })),
    rpc: vi.fn(async (name) => ({ error: name === failRpc ? { code: failRpcCode } : null })),
  }
}

async function callRoute(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

describe('account deletion API route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: 'user-a' } }
        : { error: { message: 'invalid jwt' } }
    ))
    clearSupabaseAdminClientForTests()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setSupabaseAuthVerifierForTests(null)
    clearSupabaseAdminClientForTests()
  })

  it('requires auth before any deletion work', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'cloud-data' }, token: '' }))

    expect(response.statusCode).toBe(401)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('returns dry-run readiness without deleting rows', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'dry-run' } }))

    expect(response.statusCode).toBe(200)
    expect(response.body.readiness.deletionTables).not.toContain('user_entitlements')
    expect(client.from).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON safely', async () => {
    const response = await callRoute(createRequest({ body: '{not-json' }))

    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
  })

  it('deletes only user-owned cloud rows with the verified user id', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))

    expect(response.statusCode).toBe(200)
    expect(client.rpc).toHaveBeenCalledWith('social_purge_user_data', { p_user_id: 'user-a' })
    expect(client.deletedTables.length).toBeGreaterThan(1)
    expect(client.deletedTables.every((entry) => entry.column === 'user_id')).toBe(true)
    expect(client.deletedTables.every((entry) => entry.userId === 'user-a')).toBe(true)
    expect(client.deletedTables.map((entry) => entry.table)).not.toContain('user_entitlements')
  })

  it('reports partial failure instead of pretending deletion completed', async () => {
    setSupabaseAdminClientForTests(createDeletionClient({ failTable: 'user_sync_items' }))
    const response = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))

    expect(response.statusCode).toBe(207)
    expect(response.body.ok).toBe(false)
    expect(response.body.summary.partialFailure).toBe(true)
  })

  it('does not delete auth user during cloud-data deletion', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))

    expect(response.statusCode).toBe(200)
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('blocks auth user deletion when the kill switch is off', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account' } }))

    expect(response.statusCode).toBe(409)
    expect(response.body.summary.authDeletion.reason).toBe('auth_delete_disabled')
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('deletes the auth user last only when explicitly enabled', async () => {
    process.env.ACCOUNT_DELETION_ENABLE_AUTH_DELETE = 'true'
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account' } }))

    expect(response.statusCode).toBe(200)
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith('user-a')
    const lastCleanup = Math.max(
      ...client.rpc.mock.invocationCallOrder,
      ...client.from.mock.invocationCallOrder,
    )
    expect(client.auth.admin.deleteUser.mock.invocationCallOrder[0]).toBeGreaterThan(lastCleanup)
  })

  it('purges exclusive rows for the verified user after backups and ignores a client user id', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({
      body: { mode: 'cloud-data', user_id: 'user-b' },
    }))
    const backupIndex = client.deletedTables.findIndex((entry) => entry.table === 'user_backups')
    const exclusiveIndex = client.rpc.mock.calls.findIndex((call) => call[0] === 'purge_exclusive_user_data')

    expect(response.statusCode).toBe(200)
    expect(backupIndex).toBeGreaterThan(-1)
    expect(exclusiveIndex).toBeGreaterThan(-1)
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'purge_family_membership', { p_user_id: 'user-a' })
    expect(client.rpc).toHaveBeenCalledWith('purge_exclusive_user_data', { p_user_id: 'user-a' })
    expect(client.deletedTables.every((entry) => entry.userId === 'user-a')).toBe(true)
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('treats a second exclusive purge with no remaining rows as success', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)

    const first = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))
    const second = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(client.rpc.mock.calls.filter((call) => call[0] === 'purge_exclusive_user_data')).toHaveLength(2)
  })

  it('does not delete the backup key or the auth user when backup deletion fails', async () => {
    process.env.ACCOUNT_DELETION_ENABLE_AUTH_DELETE = 'true'
    const client = createDeletionClient({ failTable: 'user_backups' })
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account' } }))

    expect(response.statusCode).toBe(207)
    expect(client.rpc).toHaveBeenCalledWith('purge_family_membership', { p_user_id: 'user-a' })
    expect(client.rpc).not.toHaveBeenCalledWith('purge_exclusive_user_data', { p_user_id: 'user-a' })
    expect(client.rpc).not.toHaveBeenCalledWith('purge_place_participation', { p_user_id: 'user-a' })
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
    expect(response.body.summary.results.some((result) => result.table === 'purge_exclusive_user_data' && result.ok === false)).toBe(true)
  })

  it('purges place participation for the verified user only after exclusive purge succeeds', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({
      body: { mode: 'cloud-data', user_id: 'user-b' },
    }))
    const exclusiveIndex = client.rpc.mock.calls.findIndex((call) => call[0] === 'purge_exclusive_user_data')
    const participationIndex = client.rpc.mock.calls.findIndex((call) => call[0] === 'purge_place_participation')

    expect(response.statusCode).toBe(200)
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'purge_family_membership', { p_user_id: 'user-a' })
    expect(participationIndex).toBeGreaterThan(exclusiveIndex)
    expect(client.rpc).toHaveBeenCalledWith('purge_place_participation', { p_user_id: 'user-a' })
    expect(client.rpc).not.toHaveBeenCalledWith('purge_place_participation', { p_user_id: 'user-b' })
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('treats a second place-participation purge with no remaining rows as success', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)

    const first = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))
    const second = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(client.rpc.mock.calls.filter((call) => call[0] === 'purge_place_participation')).toHaveLength(2)
  })

  it('does not run place participation or auth deletion when exclusive purge fails', async () => {
    process.env.ACCOUNT_DELETION_ENABLE_AUTH_DELETE = 'true'
    const client = createDeletionClient({ failRpc: 'purge_exclusive_user_data' })
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account' } }))

    expect(response.statusCode).toBe(207)
    expect(client.rpc).toHaveBeenCalledWith('purge_family_membership', { p_user_id: 'user-a' })
    expect(client.rpc).toHaveBeenCalledWith('purge_exclusive_user_data', { p_user_id: 'user-a' })
    expect(client.rpc).not.toHaveBeenCalledWith('purge_place_participation', { p_user_id: 'user-a' })
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('does not delete the auth user when place participation purge fails', async () => {
    process.env.ACCOUNT_DELETION_ENABLE_AUTH_DELETE = 'true'
    const client = createDeletionClient({ failRpc: 'purge_place_participation' })
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account' } }))

    expect(response.statusCode).toBe(207)
    expect(client.rpc).toHaveBeenCalledWith('purge_family_membership', { p_user_id: 'user-a' })
    expect(client.rpc).toHaveBeenCalledWith('purge_place_participation', { p_user_id: 'user-a' })
    expect(response.body.summary.results.some((result) => result.table === 'purge_place_participation' && result.ok === false)).toBe(true)
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('runs family membership first for the verified user and then the remaining purge chain', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({
      body: { mode: 'cloud-data', user_id: 'user-b' },
    }))
    const names = client.rpc.mock.calls.map((call) => call[0])

    expect(response.statusCode).toBe(200)
    expect(names).toEqual([
      'purge_family_membership',
      'social_purge_user_data',
      'purge_exclusive_user_data',
      'purge_place_participation',
    ])
    expect(client.deletedTables.map((entry) => entry.table)).toEqual([
      'user_sync_items',
      'user_sync_events',
      'user_sync_state',
      'user_backups',
    ])
    expect(client.rpc).toHaveBeenCalledWith('purge_family_membership', { p_user_id: 'user-a' })
    expect(client.rpc).not.toHaveBeenCalledWith('purge_family_membership', { p_user_id: 'user-b' })
    expect(client.deletedTables.every((entry) => entry.userId === 'user-a')).toBe(true)
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('treats a second family-membership purge with no remaining rows as success', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)

    const first = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))
    const second = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(client.rpc.mock.calls.filter((call) => call[0] === 'purge_family_membership')).toHaveLength(2)
  })

  it('stops the deletion chain when family membership returns no remaining guardian', async () => {
    process.env.ACCOUNT_DELETION_ENABLE_AUTH_DELETE = 'true'
    const client = createDeletionClient({
      failRpc: 'purge_family_membership',
      failRpcCode: 'no remaining guardian',
    })
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account', user_id: 'user-b' } }))

    expect(response.statusCode).toBe(207)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('purge_family_membership', { p_user_id: 'user-a' })
    expect(client.from).not.toHaveBeenCalled()
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('stops the deletion chain for any other family membership failure', async () => {
    process.env.ACCOUNT_DELETION_ENABLE_AUTH_DELETE = 'true'
    const client = createDeletionClient({
      failRpc: 'purge_family_membership',
      failRpcCode: 'connection_failed',
    })
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account' } }))

    expect(response.statusCode).toBe(207)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('purge_family_membership', { p_user_id: 'user-a' })
    expect(client.from).not.toHaveBeenCalled()
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
})
