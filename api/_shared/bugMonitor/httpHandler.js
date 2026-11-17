import { createHash } from 'node:crypto'
import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../aiRouteErrors.js'
import { requireBillingAdmin } from '../billing/admin.js'
import { verifySupabaseUser } from '../verifySupabaseUser.js'
import { planBugInvestigation, serverReleaseName } from '../../../src/services/bugMonitor/bugMonitor.js'
import { resolveBugMonitorStore } from '../../../src/services/bugMonitor/bugMonitorStore.js'

let testAdminCheck = null

export function setBugMonitorAdminLookupForTests(check = null) {
  testAdminCheck = check
}

function hashActor(userId) {
  return createHash('sha256').update(`viktkollen-bug-monitor:${userId}`).digest('hex').slice(0, 16)
}

function readJson(request) {
  const body = request.body
  if (body == null || body === '') return {}
  if (typeof body === 'string') {
    if (body.length > 4000) return { tooLarge: true }
    try {
      return JSON.parse(body)
    } catch {
      return { invalid: true }
    }
  }
  if (typeof body !== 'object' || Array.isArray(body)) return { invalid: true }
  if (JSON.stringify(body).length > 4000) return { tooLarge: true }
  return body
}

async function authorizeAdmin(request, requestId) {
  if (typeof testAdminCheck === 'function') return testAdminCheck(request, requestId)
  return requireBillingAdmin(request, { requestId, securityFeature: 'bug-monitor' })
}

async function actorForIngest(request, requestId) {
  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) return { error: auth }
  return { actorKey: hashActor(auth.user.id) }
}

async function readStore() {
  const store = resolveBugMonitorStore()
  if (!store) return null
  return store
}

function storedPayload(store, summary, requestId) {
  return {
    durable: store.durable === true,
    ok: true,
    requestId,
    storage: store.kind === 'memory' ? 'memory' : 'supabase',
    summary,
  }
}

function unavailable(response, requestId) {
  return sendSafeAiError(response, {
    code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
    requestId,
    retryable: true,
    safeMessage: 'Felövervakningen är inte tillgänglig just nu.',
    status: 503,
  })
}

export default async function handler(request, response) {
  const requestId = `bug-${Date.now().toString(36)}`
  setNoStoreHeaders(response)
  const method = String(request.method || 'GET').toUpperCase()

  if (method === 'GET') {
    const admin = await authorizeAdmin(request, requestId)
    if (!admin.ok) {
      return sendSafeAiError(response, {
        code: admin.error?.code || aiRouteErrorCodes.AUTH_REQUIRED,
        requestId,
        status: admin.status || 401,
      })
    }
    const store = await readStore()
    if (!store) return unavailable(response, requestId)
    try {
      const summary = await store.summary()
      return response.status(200).json(storedPayload(store, summary, requestId))
    } catch {
      return unavailable(response, requestId)
    }
  }

  if (method !== 'POST') {
    response.setHeader('Allow', 'GET, POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      status: 405,
    })
  }

  const body = readJson(request)
  if (body.tooLarge) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.REQUEST_TOO_LARGE,
      requestId,
      status: 413,
    })
  }
  if (body.invalid) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      status: 400,
    })
  }

  if (body.action) {
    const admin = await authorizeAdmin(request, requestId)
    if (!admin.ok) {
      return sendSafeAiError(response, {
        code: admin.error?.code || aiRouteErrorCodes.AUTH_REQUIRED,
        requestId,
        status: admin.status || 401,
      })
    }
    const fingerprint = String(body.fingerprint || '')
    const actionStore = await readStore()
    if (!actionStore) return unavailable(response, requestId)
    if (body.action === 'acknowledge') {
      let updated
      try {
        updated = await actionStore.acknowledge(fingerprint)
      } catch {
        return unavailable(response, requestId)
      }
      if (!updated) {
        return sendSafeAiError(response, {
          code: aiRouteErrorCodes.INVALID_REQUEST,
          requestId,
          status: 404,
        })
      }
      const summary = await actionStore.summary()
      return response.status(200).json(storedPayload(actionStore, summary, requestId))
    }
    if (body.action === 'plan') {
      const summary = await actionStore.summary()
      const group = summary.groups.find((item) => item.fingerprint === fingerprint)
      const plan = planBugInvestigation(group)
      if (!plan.ok) {
        return sendSafeAiError(response, {
          code: aiRouteErrorCodes.INVALID_REQUEST,
          requestId,
          status: 404,
        })
      }
      return response.status(200).json({ ok: true, plan, requestId })
    }
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      status: 400,
    })
  }

  const actor = await actorForIngest(request, requestId)
  if (actor.error) {
    return sendSafeAiError(response, {
      code: actor.error.error?.code || aiRouteErrorCodes.AUTH_INVALID,
      requestId,
      status: actor.error.status || 401,
    })
  }

  const ingestStore = await readStore()
  if (!ingestStore) return unavailable(response, requestId)
  let accepted
  try {
    accepted = await ingestStore.accept({
      appVersion: body.appVersion,
      errorType: body.errorType,
      feature: body.feature,
      fingerprint: body.fingerprint,
      occurredAt: body.occurredAt,
      severity: body.severity,
      source: body.source === 'ai-help' ? 'ai-help' : 'frontend',
    }, {
      actorKey: actor.actorKey,
      release: serverReleaseName(),
    })
  } catch {
    return unavailable(response, requestId)
  }

  if (!accepted?.ok && accepted?.code === 'RATE_LIMITED') {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.RATE_LIMITED,
      requestId,
      retryable: true,
      status: 429,
    })
  }
  if (!accepted?.ok) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      status: 400,
    })
  }

  return response.status(202).json({
    fingerprint: accepted.fingerprint,
    ok: true,
    requestId,
    stored: accepted.stored === true,
  })
}
