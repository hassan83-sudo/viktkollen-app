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
    expect(response.body.readiness.accountPurgeRpc).toBe('purge_account_user_data')
    expect(response.body.readiness.authDeleteEnabled).toBe(false)
    expect(client.rpc).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON safely', async () => {
    const response = await callRoute(createRequest({ body: '{not-json' }))

    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
  })

  it('calls purge_account_user_data once for the verified user', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))

    expect(response.statusCode).toBe(200)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('purge_account_user_data', { p_user_id: 'user-a' })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('reports rpc failure instead of pretending deletion completed', async () => {
    const client = createDeletionClient({ failRpc: 'purge_account_user_data' })
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account' } }))

    expect(response.statusCode).toBe(207)
    expect(response.body.ok).toBe(false)
    expect(response.body.summary.ok).toBe(false)
    expect(response.body.summary.partialFailure).toBe(true)
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
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
    expect(client.auth.admin.deleteUser.mock.invocationCallOrder[0]).toBeGreaterThan(
      client.rpc.mock.invocationCallOrder[0],
    )
  })

  it('ignores a client-supplied user id', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({
      body: { mode: 'cloud-data', user_id: 'user-b' },
    }))

    expect(response.statusCode).toBe(200)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('purge_account_user_data', { p_user_id: 'user-a' })
    expect(client.rpc).not.toHaveBeenCalledWith('purge_account_user_data', { p_user_id: 'user-b' })
    expect(client.from).not.toHaveBeenCalled()
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('does not call the retired per-step purge chain', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'cloud-data', user_id: 'user-b' } }))
    const names = client.rpc.mock.calls.map((call) => call[0])

    expect(response.statusCode).toBe(200)
    expect(names).toEqual(['purge_account_user_data'])
    expect(names).not.toContain('purge_family_membership')
    expect(names).not.toContain('social_purge_user_data')
    expect(names).not.toContain('purge_exclusive_user_data')
    expect(names).not.toContain('purge_place_participation')
    expect(client.from).not.toHaveBeenCalled()
  })

  it('treats a second purge with no remaining rows as success', async () => {
    const client = createDeletionClient()
    setSupabaseAdminClientForTests(client)

    const first = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))
    const second = await callRoute(createRequest({ body: { mode: 'cloud-data' } }))

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(client.rpc.mock.calls.filter((call) => call[0] === 'purge_account_user_data')).toHaveLength(2)
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('does not report success when auth deletion fails after the database purge', async () => {
    process.env.ACCOUNT_DELETION_ENABLE_AUTH_DELETE = 'true'
    const client = createDeletionClient({ authError: { code: 'auth_delete_failed' } })
    setSupabaseAdminClientForTests(client)
    const response = await callRoute(createRequest({ body: { mode: 'account' } }))

    expect(response.statusCode).toBe(500)
    expect(response.body.ok).toBe(false)
    expect(response.body.summary.ok).toBe(false)
    expect(client.rpc).toHaveBeenCalledWith('purge_account_user_data', { p_user_id: 'user-a' })
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith('user-a')
    expect(client.auth.admin.deleteUser.mock.invocationCallOrder[0]).toBeGreaterThan(
      client.rpc.mock.invocationCallOrder[0],
    )
  })
})
