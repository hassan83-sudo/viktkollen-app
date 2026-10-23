import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import handler, { objectBankScanRouteInternals } from './index.js'
import { callOpenAiJson } from '../_shared/openaiGateway.js'
import { executeAiEyeMeteredOperation } from '../_shared/billing/aiEyeLiveBilling.js'
vi.mock('../_shared/openaiGateway.js', () => ({ callOpenAiJson: vi.fn(), getAiGatewayConfig: () => ({ model: 'gpt-4.1-mini' }) }))
vi.mock('../_shared/verifySupabaseUser.js', () => ({ verifySupabaseUser: vi.fn(async () => ({ authenticated: true, user: { id: 'fixture-user' } })) }))
vi.mock('../_shared/analysisConsent.js', () => ({ analysisConsentPurposes: { objectBankScan: 'object-bank-scan' }, verifyAnalysisConsentToken: () => ({ ok: true }) }))
vi.mock('../_shared/billing/aiEyeLiveBilling.js', () => ({ createAiEyeOperationId: () => 'fixture-operation', resolveAiEyeBillingRuntime: async () => ({ ok: true }), executeAiEyeMeteredOperation: vi.fn(async ({ executeProvider }) => { await executeProvider({ markDispatched: async () => ({ claimed: true }) }); return { billing: {} } }), mapAiEyeBillingHttp: () => ({ kind: 'success' }) }))
vi.mock('../_shared/aiRequestDeduper.js', () => ({ createImageFingerprint: () => 'same-image', runDedupedAiRequest: (_key, work) => ({ promise: work() }) }))
const accepted = { verdict: 'garment', reason: null, personPresent: false, singleItem: true, name: 'Skjorta', category: 'Skjorta', colorName: 'Blå', colorHex: '#446fa4' }
function request(mode) {
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  const body = Buffer.concat([Buffer.from(`--test\r\nContent-Disposition: form-data; name="mode"\r\n\r\n${mode}\r\n--test\r\nContent-Disposition: form-data; name="image"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), image, Buffer.from('\r\n--test--\r\n')])
  return { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test', host: 'localhost' }, body }
}
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } }
beforeEach(() => { vi.stubEnv('OPENAI_API_KEY', 'fixture-only-not-a-real-key'); vi.stubEnv('VERCEL_ENV', 'development'); vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'local-regression-fixtures'); callOpenAiJson.mockResolvedValue({ ok: true, value: accepted }) })
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
describe('wardrobe analysis server mode', () => {
  it('returns the validated garment fields and sends the dedicated review prompt', async () => {
    const res = response(); await handler(request('wardrobe'), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, result: accepted }))
    expect(callOpenAiJson.mock.calls[0][0].input[0].content[0].text).toContain('Avvisa hela bilden')
    expect(executeAiEyeMeteredOperation).toHaveBeenCalledTimes(1)
  })
  it.each([{ verdict: 'reject', reason: 'person' }, { verdict: 'garment', name: 'Incomplete' }])('fails closed for unsafe or malformed verdict %j', async (value) => {
    callOpenAiJson.mockResolvedValue({ ok: true, value })
    const res = response(); await handler(request('wardrobe'), res)
    expect(res.json.mock.calls[0][0].result.verdict).toBe('reject')
    expect(res.json.mock.calls[0][0].result).not.toHaveProperty('name')
  })
  it('preserves the existing object-bank result contract', async () => {
    callOpenAiJson.mockResolvedValue({ ok: true, value: { items: ['Nycklar'] } })
    const res = response(); await handler(request('objects'), res)
    expect(res.json.mock.calls[0][0].result).toEqual({ items: ['Nycklar'] })
  })
  it('rejects unknown mode without calling billing or provider', async () => {
    const res = response(); await handler(request('invalid'), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(callOpenAiJson).not.toHaveBeenCalled()
    expect(executeAiEyeMeteredOperation).not.toHaveBeenCalled()
  })
  it('defines strict rejection rules for people, body parts and uncertainty', () => {
    const prompt = objectBankScanRouteInternals.createWardrobePrompt()
    expect(prompt).toContain('händer'); expect(prompt).toContain('all osäkerhet')
  })
})
