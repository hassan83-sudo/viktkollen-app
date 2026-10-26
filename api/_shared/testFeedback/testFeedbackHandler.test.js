import { describe, expect, it, vi } from 'vitest'
import testFeedbackHandler from './testFeedbackHandler.js'

const REQUEST_ID = '11111111-2222-4333-8444-555555555555'
const REPORT_ID = '66666666-7777-4888-9999-aaaaaaaaaaaa'

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) { this.body = body; return this },
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
  }
}

function setup({ admin = true, authenticated = true, rpcResult = { data: { ok: true, report: { id: REPORT_ID } }, error: null } } = {}) {
  const rpc = vi.fn(async () => rpcResult)
  return {
    deps: {
      createClient: () => ({ rpc }),
      requireAdmin: vi.fn(async () => (admin ? { ok: true, user: { id: 'admin-1' } } : { ok: false, status: 403, error: { code: 'FORBIDDEN' } })),
      verifyUser: vi.fn(async () => (authenticated ? { authenticated: true, user: { id: 'user-1' } } : { authenticated: false, status: 401, error: { code: 'AUTH_REQUIRED' } })),
    },
    rpc,
  }
}

const validReport = {
  category: 'slow',
  comment: '  Laddar länge  ',
  features: ['food_scan', 'speed', 'food_scan'],
  rating: 'partly',
  requestId: REQUEST_ID,
}

describe('testfeedback-API', () => {
  it('sparar med användar-ID från sessionen, inte från klienten', async () => {
    const { deps, rpc } = setup()
    const response = createResponse()
    await testFeedbackHandler({ body: { ...validReport, userId: 'someone-else', user_id: 'someone-else' }, method: 'POST', url: '/api/test-feedback' }, response, deps)
    expect(response.statusCode).toBe(201)
    expect(rpc).toHaveBeenCalledWith('test_feedback_customer_command', {
      p_action: 'create',
      p_actor: 'user-1',
      p_body: { appVersion: '', category: 'slow', comment: 'Laddar länge', features: ['food_scan', 'speed'], rating: 'partly', requestId: REQUEST_ID },
    })
  })

  it('kräver inloggning', async () => {
    const { deps, rpc } = setup({ authenticated: false })
    const response = createResponse()
    await testFeedbackHandler({ body: validReport, method: 'POST', url: '/api/test-feedback' }, response, deps)
    expect(response.statusCode).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('låter inte vanliga användare läsa rapporter', async () => {
    const { deps, rpc } = setup()
    const response = createResponse()
    await testFeedbackHandler({ method: 'GET', url: '/api/test-feedback' }, response, deps)
    expect(response.statusCode).toBe(405)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('nekar admin-läsning utan adminrätt', async () => {
    const { deps, rpc } = setup({ admin: false })
    const response = createResponse()
    await testFeedbackHandler({ method: 'GET', query: { resource: 'admin' }, url: '/api/test-feedback?resource=admin' }, response, deps)
    expect(response.statusCode).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['okänd funktion', { features: ['hacker'] }],
    ['ingen funktion', { features: [] }],
    ['okänd kategori', { category: 'x' }],
    ['okänd bedömning', { rating: 'great' }],
    ['för lång kommentar', { comment: 'a'.repeat(4001) }],
    ['saknat request-ID', { requestId: 'abc' }],
  ])('avvisar %s', async (_name, change) => {
    const { deps, rpc } = setup()
    const response = createResponse()
    await testFeedbackHandler({ body: { ...validReport, ...change }, method: 'POST', url: '/api/test-feedback' }, response, deps)
    expect(response.statusCode).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('godtar svar utan bedömning', async () => {
    const { deps, rpc } = setup()
    const response = createResponse()
    await testFeedbackHandler({ body: { ...validReport, rating: null }, method: 'POST', url: '/api/test-feedback' }, response, deps)
    expect(response.statusCode).toBe(201)
    expect(rpc.mock.calls[0][1].p_body.rating).toBeNull()
  })

  it('avvisar för stora anrop', async () => {
    const { deps, rpc } = setup()
    const response = createResponse()
    await testFeedbackHandler({ body: JSON.stringify({ ...validReport, comment: 'a'.repeat(13000) }), method: 'POST', url: '/api/test-feedback' }, response, deps)
    expect(response.statusCode).toBe(413)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('vidarebefordrar databasens gräns för missbruk', async () => {
    const { deps } = setup({ rpcResult: { data: { ok: false, code: 'RATE_LIMITED' }, error: null } })
    const response = createResponse()
    await testFeedbackHandler({ body: validReport, method: 'POST', url: '/api/test-feedback' }, response, deps)
    expect(response.statusCode).toBe(429)
  })

  it('låter admin ändra status med versionskontroll', async () => {
    const { deps, rpc } = setup()
    const response = createResponse()
    await testFeedbackHandler({
      body: { adminNote: 'Fixad i 1.2', reportId: REPORT_ID, status: 'resolved', version: 2 },
      method: 'POST',
      query: { resource: 'admin' },
      url: '/api/test-feedback?resource=admin',
    }, response, deps)
    expect(response.statusCode).toBe(200)
    expect(rpc).toHaveBeenCalledWith('test_feedback_admin_command', {
      p_action: 'update',
      p_actor: 'admin-1',
      p_body: { adminNote: 'Fixad i 1.2', reportId: REPORT_ID, status: 'resolved', version: 2 },
    })
  })

  it('svarar 503 när databasen inte nås', async () => {
    const { deps } = setup({ rpcResult: { data: null, error: { message: 'down' } } })
    const response = createResponse()
    await testFeedbackHandler({ body: validReport, method: 'POST', url: '/api/test-feedback' }, response, deps)
    expect(response.statusCode).toBe(503)
  })
})
