import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { serverExtraScanService } from './extraScanCheckout.js'

export async function handleExtraScanRequest(request, response, { service = serverExtraScanService(), verifyUser = verifySupabaseUser, webhook = false } = {}) {
  response.setHeader('Cache-Control', 'no-store')
  if (!service) return response.status(503).json({ ok: false, error: { code: 'EXTRA_SCANS_DISABLED' } })
  const action = webhook ? 'webhook' : request.method === 'GET' ? 'catalog' : request.body?.action
  if (request.method !== 'GET' && request.method !== 'POST') return response.status(405).json({ ok: false })
  try {
    if (action === 'webhook') {
      if (!webhook || request.method !== 'POST') return response.status(400).json({ ok: false })
      if (request.body?.event_type !== 'CHECKOUT_STATUS_CHANGED') return response.status(400).json({ ok: false })
      await service.webhook(request.body.id)
      return response.status(200).json({ ok: true })
    }
    const auth = await verifyUser(request)
    if (!auth.authenticated) return response.status(auth.status || 401).json({ ok: false, error: auth.error })
    const userId = auth.user.id
    if (action === 'catalog') return response.status(200).json({ ok: true, catalog: service.catalog(), batches: await service.balance(userId) })
    if (action === 'create') {
      const intent = await service.create(userId, request.body)
      return response.status(200).json({ ok: true, id: intent.id, amountMinor: intent.amount_minor, currency: 'SEK', hostedUrl: intent.hosted_url })
    }
    if (action === 'verify') return response.status(200).json({ ok: true, payment: await service.verify(userId, request.body.id), batches: await service.balance(userId) })
    return response.status(400).json({ ok: false, error: { code: 'INVALID_ACTION' } })
  } catch {
    return response.status(503).json({ ok: false, error: { code: 'PURCHASE_UNAVAILABLE' } })
  }
}
