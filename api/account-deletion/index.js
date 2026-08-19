import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import { createSupabaseAdminClient } from '../_shared/supabaseServer.js'
import { verifySupabaseUser } from '../_shared/verifySupabaseUser.js'

const deletionTables = Object.freeze([
  { area: 'entitlement', name: 'user_entitlements' },
  { area: 'cloudData', name: 'user_sync_items' },
  { area: 'cloudData', name: 'user_sync_events' },
  { area: 'cloudData', name: 'user_sync_state' },
  { area: 'cloudData', name: 'user_backups' },
])

function parseBody(request) {
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  return request.body || {}
}

function normalizeMode(value) {
  return ['dry-run', 'cloud-data', 'account'].includes(value) ? value : 'dry-run'
}

function canDeleteAuthUser(env = process.env) {
  return env.ACCOUNT_DELETION_ENABLE_AUTH_DELETE === 'true'
}

async function deleteRowsForUser(client, userId, tables = deletionTables) {
  const results = []

  for (const table of tables) {
    try {
      const { error } = await client
        .from(table.name)
        .delete()
        .eq('user_id', userId)

      results.push({
        area: table.area,
        ok: !error,
        table: table.name,
        ...(error ? { errorCode: error.code || 'delete_failed' } : {}),
      })
    } catch (error) {
      results.push({
        area: table.area,
        errorCode: error?.code || 'delete_failed',
        ok: false,
        table: table.name,
      })
    }
  }

  return results
}

async function deleteAuthUser({ client, env = process.env, userId }) {
  if (!canDeleteAuthUser(env)) {
    return {
      blocked: true,
      ok: false,
      reason: 'auth_delete_disabled',
    }
  }

  if (!client?.auth?.admin?.deleteUser) {
    return {
      blocked: true,
      ok: false,
      reason: 'auth_admin_unavailable',
    }
  }

  const { error } = await client.auth.admin.deleteUser(userId)
  return {
    ok: !error,
    ...(error ? { errorCode: error.code || 'auth_delete_failed' } : {}),
  }
}

function summarizeDeletion({ authResult = null, mode, rowResults = [] }) {
  const failed = rowResults.filter((result) => !result.ok)
  const partialFailure = failed.length > 0

  return {
    authDeletion: authResult,
    mode,
    ok: !partialFailure && (mode !== 'account' || authResult?.ok === true),
    partialFailure,
    results: rowResults,
  }
}

export default async function handler(request, response) {
  const requestId = `del-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast POST stöds.',
      status: 405,
    })
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }

  let body
  try {
    body = parseBody(request)
  } catch {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Ogiltig JSON i förfrågan.',
      status: 400,
    })
  }

  const mode = normalizeMode(body.mode)
  const client = createSupabaseAdminClient()
  const readiness = {
    authDeleteEnabled: canDeleteAuthUser(),
    deletionTables: deletionTables.map((table) => table.name),
    mode,
    serviceRoleConfigured: Boolean(client),
  }

  if (mode === 'dry-run') {
    return response.status(200).json({
      ok: true,
      readiness,
      requestId,
    })
  }

  if (!client) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.AUTH_UNAVAILABLE,
      requestId,
      retryable: false,
      safeMessage: 'Kontoradering kräver serverkonfigurerad Supabase admin-åtkomst.',
      status: 503,
    })
  }

  const rowResults = await deleteRowsForUser(client, auth.user.id)
  if (rowResults.some((result) => !result.ok)) {
    return response.status(207).json({
      ok: false,
      requestId,
      summary: summarizeDeletion({ mode, rowResults }),
    })
  }

  const authResult = mode === 'account'
    ? await deleteAuthUser({ client, userId: auth.user.id })
    : null

  if (mode === 'account' && !authResult.ok) {
    return response.status(authResult.blocked ? 409 : 500).json({
      ok: false,
      requestId,
      summary: summarizeDeletion({ authResult, mode, rowResults }),
    })
  }

  return response.status(200).json({
    ok: true,
    requestId,
    summary: summarizeDeletion({ authResult, mode, rowResults }),
  })
}

export const accountDeletionRouteInternals = {
  canDeleteAuthUser,
  deleteAuthUser,
  deleteRowsForUser,
  deletionTables,
  normalizeMode,
  summarizeDeletion,
}
