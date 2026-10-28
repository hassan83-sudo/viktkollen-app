import { createHash, timingSafeEqual } from 'node:crypto'
import { createSumUpHttpTransport, readSumUpConfig } from './providers/sumup.js'
import { stagingSupabaseReady } from './sumupOneTimeCheckout.js'

// Temporary read-only diagnostic; remove after identity verification.
const TOKEN_HASH = '864a0de8c8f4e5205b1a82667141d8973dd2e09b98896b0516d012d146aa3b6b'
const EXPIRES_AT = 1793194239617
export async function handleIdentityProbe(request, response, { env = process.env, now = Date.now(), transport } = {}) {
  response.setHeader('Cache-Control', 'no-store')
  const token = request.headers?.['x-vk-identity-probe']
  const authorized = typeof token === 'string' && token.length === 64
    && timingSafeEqual(Buffer.from(TOKEN_HASH, 'hex'), createHash('sha256').update(token).digest())
  if (!authorized || now >= EXPIRES_AT || env.VERCEL_ENV !== 'preview' || !stagingSupabaseReady(env)) {
    return response.status(404).json({ ok: false, code: 'NOT_AVAILABLE' })
  }
  if (request.method !== 'GET') return response.status(405).json({ ok: false, code: 'GET_REQUIRED' })
  const config = readSumUpConfig(env)
  if (!config) return response.status(503).json({ ok: false, code: 'NOT_CONFIGURED' })
  try {
    const merchant = await (transport || createSumUpHttpTransport({ apiKey: config.apiKey })).retrieveMerchant(config.merchantCode)
    const matched = merchant?.merchant_code === config.merchantCode
    const sandbox = merchant?.sandbox
    const code = !matched ? 'MERCHANT_MISMATCH' : sandbox === true ? 'SANDBOX_CONFIRMED' : sandbox === false ? 'LIVE_ACCOUNT' : 'SANDBOX_FIELD_MISSING'
    return response.status(200).json({ ok: code === 'SANDBOX_CONFIRMED', code })
  } catch {
    return response.status(502).json({ ok: false, code: 'IDENTITY_LOOKUP_FAILED' })
  }
}
