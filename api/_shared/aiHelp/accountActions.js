import { createClient } from '@supabase/supabase-js'
import { accountDeletionRouteInternals } from '../../account-deletion/index.js'
import { verifySupabaseUserInternals } from '../verifySupabaseUser.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function publicAuthAccount(user) {
  const email = typeof user?.email === 'string' ? user.email.trim().slice(0, 160) : ''
  const createdAt = typeof user?.createdAt === 'string' ? user.createdAt.trim().slice(0, 40) : ''
  return {
    createdAt,
    email: EMAIL_RE.test(email) ? email : '',
    emailConfirmed: user?.emailConfirmed === true,
  }
}

async function defaultPasswordReset(email) {
  const { anonKey, url } = verifySupabaseUserInternals.getSupabaseServerConfig()
  if (!url || !anonKey) return { error: { code: 'unavailable' } }
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const result = await client.auth.resetPasswordForEmail(email)
  return { error: result?.error || null }
}

export async function sendVerifiedPasswordReset({ email, reset = defaultPasswordReset } = {}) {
  const safeEmail = publicAuthAccount({ email }).email
  if (!safeEmail) return { code: 'ACCOUNT_EMAIL_UNAVAILABLE', ok: false, status: 409 }
  if (typeof reset !== 'function') return { code: 'PASSWORD_RESET_UNAVAILABLE', ok: false, status: 503 }
  try {
    const result = await reset(safeEmail)
    if (result?.error) return { code: 'PASSWORD_RESET_FAILED', ok: false, status: 502 }
    return { code: 'RESET_EMAIL_SENT', ok: true, status: 200 }
  } catch {
    return { code: 'PASSWORD_RESET_FAILED', ok: false, status: 502 }
  }
}

export async function deleteVerifiedAccount({
  deleteAuth,
  deleteRows,
  env = process.env,
  userId,
} = {}) {
  if (!userId) return { code: 'AUTH_REQUIRED', ok: false, status: 401 }
  const client = createSupabaseAdminClient()
  if (!deleteRows && !deleteAuth && !client) {
    return { code: 'ACCOUNT_DELETE_UNAVAILABLE', ok: false, status: 503 }
  }
  const rowsFn = deleteRows || ((id) => accountDeletionRouteInternals.deleteRowsForUser(client, id))
  const authFn = deleteAuth || ((id) => accountDeletionRouteInternals.deleteAuthUser({ client, env, userId: id }))
  const rowResults = await rowsFn(userId)
  if (!Array.isArray(rowResults) || rowResults.some((result) => !result?.ok)) {
    return { code: 'ACCOUNT_DELETE_FAILED', ok: false, status: 207 }
  }
  const authResult = await authFn(userId)
  if (!authResult?.ok) {
    return {
      code: authResult?.blocked ? 'ACCOUNT_DELETE_BLOCKED' : 'ACCOUNT_DELETE_FAILED',
      ok: false,
      status: authResult?.blocked ? 409 : 500,
    }
  }
  return { code: 'ACCOUNT_DELETED', ok: true, status: 200 }
}
