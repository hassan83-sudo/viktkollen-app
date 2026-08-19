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

function createDeletionClient({ failTable = '', authError = null } = {}) {
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
    expect(response.body.readiness.deletionTables).toContain('user_entitlements')
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
    expect(client.deletedTables.length).toBeGreaterThan(1)
    expect(client.deletedTables.every((entry) => entry.column === 'user_id')).toBe(true)
    expect(client.deletedTables.every((entry) => entry.userId === 'user-a')).toBe(true)
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
  })
})
