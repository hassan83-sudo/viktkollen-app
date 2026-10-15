import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import handler, { setBugMonitorAdminLookupForTests } from './index.js'
import { sendSafeAiError } from '../_shared/aiRouteErrors.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { createMemoryBugMonitorStore, summarizeBugReports } from '../../src/services/bugMonitor/bugMonitor.js'
import { setBugMonitorStoreForTests } from '../../src/services/bugMonitor/bugMonitorStore.js'

function createResponse() {
  return {
    headers: {},
    payload: null,
    statusCode: 200,
    json(payload) {
      this.payload = payload
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
  }
}

function createRequest({ body, method = 'POST', token = '' } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
  }
}

async function invoke(options) {
  const response = createResponse()
  await handler(createRequest(options), response)
  return response
}

describe('bug monitor api', () => {
  let memory

  beforeEach(() => {
    memory = createMemoryBugMonitorStore()
    setBugMonitorStoreForTests(memory)
  })

  afterEach(() => {
    setBugMonitorStoreForTests(undefined)
    setBugMonitorAdminLookupForTests(null)
    setSupabaseAuthVerifierForTests(null)
  })

  it('rejects a report without a signed-in session', async () => {
    const response = await invoke({
      body: {
        errorType: 'render',
        fingerprint: 'render-abcd1234',
        password: 'hunter2',
      },
    })
    expect(response.statusCode).toBe(401)
    expect(summarizeBugReports().groups).toHaveLength(0)
    expect(JSON.stringify(response.payload)).not.toContain('hunter2')
  })

  it('rejects an overview without an admin session', async () => {
    const response = await invoke({ method: 'GET' })
    expect(response.statusCode).toBe(401)
    expect(response.payload.ok).toBe(false)
  })

  it('stores a sanitized report and shows a grouped overview to an admin', async () => {
    setSupabaseAuthVerifierForTests(async (token) => {
      if (token === 'person-a' || token === 'person-b' || token === 'admin') {
        return { user: { id: token } }
      }
      return { error: { message: 'invalid' } }
    })
    setBugMonitorAdminLookupForTests(async (request) => {
      if (request.headers.authorization === 'Bearer admin') {
        return { ok: true, user: { id: 'admin' } }
      }
      return { ok: false, error: { code: 'FORBIDDEN' }, status: 403 }
    })

    const report = {
      chat: 'hemlig konversation',
      errorType: 'render',
      feature: 'app',
      fingerprint: 'render-abcd1234',
      password: 'hunter2',
      severity: 'high',
    }
    const first = await invoke({ body: report, token: 'person-a' })
    const second = await invoke({ body: report, token: 'person-b' })
    expect(first.statusCode).toBe(202)
    expect(second.payload.stored).toBe(true)
    expect(JSON.stringify(first.payload)).not.toMatch(/hunter2|hemlig|person-a/)

    const denied = await invoke({ method: 'GET', token: 'person-a' })
    expect(denied.statusCode).toBe(403)

    const overview = await invoke({ method: 'GET', token: 'admin' })
    expect(overview.statusCode).toBe(200)
    expect(overview.payload.durable).toBe(false)
    expect(overview.payload.summary).toMatchObject({
      affectedCount: 2,
      newCount: 0,
      recurringCount: 1,
    })
    expect(JSON.stringify(overview.payload)).not.toMatch(/hunter2|hemlig|person-a|person-b/)

    const plan = await invoke({
      body: { action: 'plan', fingerprint: 'render-abcd1234' },
      token: 'admin',
    })
    expect(plan.statusCode).toBe(200)
    expect(plan.payload.plan.automatic.merge).toBe(false)
    expect(plan.payload.plan.automatic.productionDeploy).toBe(false)
    expect(plan.payload.plan.automatic.databaseChange).toBe(false)
    expect(plan.payload.plan.proposal.branch).toBe('fix/bug-render-abcd1234')
  })

  it('records a server failure without the request body', () => {
    const response = createResponse()
    sendSafeAiError(response, { status: 500 })
    expect(response.payload.error.code).toBe('UNKNOWN_ERROR')
    expect(memory.summary().groups[0]).toMatchObject({
      errorType: 'server',
      fingerprint: 'server-unknownerror',
      severity: 'high',
      source: 'backend',
    })
    expect(JSON.stringify(response.payload)).not.toMatch(/password|token|image/)
    expect(JSON.stringify(memory.summary())).not.toMatch(/password|token|image/)
  })

  it('refuses to store a report when the database is not configured', async () => {
    setBugMonitorStoreForTests(null)
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'person-a' } }))
    const response = await invoke({
      body: {
        errorType: 'render',
        fingerprint: 'render-abcd1234',
        password: 'hunter2',
      },
      token: 'person-a',
    })
    expect(response.statusCode).toBe(503)
    expect(summarizeBugReports().groups).toHaveLength(0)
    expect(JSON.stringify(response.payload)).not.toContain('hunter2')
  })
})
