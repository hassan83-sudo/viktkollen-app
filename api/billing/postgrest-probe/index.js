import { setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import { requireBillingAdmin } from '../../_shared/billing/admin.js'
import { createSupabaseAdminClient } from '../../_shared/supabaseServer.js'

function classifyPostgrestError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  if (code === 'PGRST106' || /schema must be one of|Invalid schema/i.test(message)) return 'SCHEMA_NOT_EXPOSED'
  if (code === '42501' || /permission denied/i.test(message)) return 'PERMISSION_DENIED'
  return 'POSTGREST_ERROR'
}

export async function probeBillingPostgrest(client) {
  const { error } = await client
    .schema('billing')
    .from('feature_controls')
    .select('feature_id')
    .limit(1)
  if (error) {
    return {
      billingPostgrestReachable: false,
      code: classifyPostgrestError(error),
      ok: false,
    }
  }
  return {
    billingPostgrestReachable: true,
    ok: true,
  }
}

export default async function handler(request, response) {
  setNoStoreHeaders(response)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ ok: false })
  }

  const admin = await requireBillingAdmin(request)
  if (!admin.ok) {
    return response.status(admin.status).json({
      error: admin.error,
      ok: false,
    })
  }

  const client = createSupabaseAdminClient()
  if (!client?.schema) {
    return response.status(503).json({
      code: 'SERVICE_ROLE_UNAVAILABLE',
      ok: false,
    })
  }

  try {
    const result = await probeBillingPostgrest(client)
    const status = result.ok ? 200 : 502
    return response.status(status).json(result)
  } catch {
    return response.status(502).json({
      billingPostgrestReachable: false,
      code: 'POSTGREST_ERROR',
      ok: false,
    })
  }
}
