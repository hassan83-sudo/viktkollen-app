import { assessActionOutcome } from './caseOutcome.js'
import { deleteVerifiedAccount, publicAuthAccount, sendVerifiedPasswordReset } from './accountActions.js'
import { sanitizeAiAction } from '../../../src/features/aiHelp/aiActions.js'
import { officialSumUpHostedCheckoutUrl } from '../../../src/features/aiHelp/hostedCheckoutUrl.js'
import { beginCheckout } from '../billing/checkoutIntent.js'
import { executeUserBillingIntent } from '../billing/userLifecycleIntent.js'
import { recordAiAction } from './actionAudit.js'
import { readDurableUserSubscription } from '../billing/subscriptionRead.js'

function finish(entry, result) {
  recordAiAction(entry)
  return result
}

export async function executeConfirmedAiAction({
  actionId,
  actorUserId,
  confirmed = false,
  accountEmail = '',
  checkout = beginCheckout,
  deleteAccount = deleteVerifiedAccount,
  execute = executeUserBillingIntent,
  passwordReset = sendVerifiedPasswordReset,
  planId = '',
  readSubscription = readDurableUserSubscription,
} = {}) {
  const requestedId = typeof actionId === 'string' ? actionId : actionId?.action || actionId?.id
  const action = sanitizeAiAction({
    action: requestedId,
    planId: planId || (typeof actionId === 'object' && actionId ? actionId.planId || actionId.plan_id : ''),
  })
  const base = { action: action?.action || 'rejected', actorUserId }
  if (!actorUserId) {
    return finish({ ...base, code: 'AUTH_REQUIRED' }, { code: 'AUTH_REQUIRED', ok: false, outcome: 'failed', resolved: false, status: 401 })
  }
  if (!action) {
    return finish({ ...base, code: 'UNKNOWN_ACTION' }, { code: 'UNKNOWN_ACTION', ok: false, outcome: 'failed', resolved: false, status: 400 })
  }
  if (action.sensitive && confirmed !== true) {
    return finish({ ...base, code: 'CONFIRMATION_REQUIRED' }, { code: 'CONFIRMATION_REQUIRED', ok: false, outcome: 'blocked', resolved: false, status: 409 })
  }
  if (action.action === 'password_reset') {
    const result = await passwordReset({ email: accountEmail })
    const code = result?.code || 'PASSWORD_RESET_FAILED'
    const outcome = assessActionOutcome({ action: action.action, code, ok: result?.ok === true })
    return finish(
      { ...base, code, ok: result?.ok === true },
      { action: action.action, code, ok: result?.ok === true, ...outcome, status: result?.status || (result?.ok ? 200 : 500) },
    )
  }
  if (action.action === 'delete_account') {
    const result = await deleteAccount({ userId: actorUserId })
    const code = result?.code || 'ACCOUNT_DELETE_FAILED'
    const outcome = assessActionOutcome({ action: action.action, code, ok: result?.ok === true })
    return finish(
      { ...base, code, ok: result?.ok === true },
      { action: action.action, code, ok: result?.ok === true, ...outcome, status: result?.status || (result?.ok ? 200 : 500) },
    )
  }
  if (action.action === 'hosted_checkout') {
    const result = await checkout({ body: { plan_id: action.planId }, userId: actorUserId })
    const hostedCheckoutUrl = officialSumUpHostedCheckoutUrl(result?.hostedCheckoutUrl)
    let code = result?.code || 'BILLING_FAILED'
    if (code === 'CHECKOUT_PENDING' && !hostedCheckoutUrl) code = 'CHECKOUT_UNAVAILABLE'
    const pending = code === 'CHECKOUT_PENDING'
    const outcome = assessActionOutcome({ action: action.action, code, ok: pending })
    return finish(
      { ...base, code, ok: pending },
      {
        action: action.action,
        code,
        ok: pending,
        ...outcome,
        status: pending ? 202 : (result?.status || 400),
        ...(pending ? { hostedCheckoutUrl } : {}),
      },
    )
  }
  if (action.action === 'plan_change' || action.action === 'schedule_cancel' || action.action === 'undo_cancel') {
    const body = action.action === 'plan_change' ? { plan_id: action.planId } : {}
    const result = await execute({ action: action.action, body, userId: actorUserId })
    const code = result?.ok ? 'completed' : (result?.code || 'BILLING_FAILED')
    let subscription = null
    if (result?.ok === true) {
      try {
        const read = await readSubscription(actorUserId)
        if (read && read.unavailable !== true) subscription = read.subscription || null
      } catch {
        subscription = null
      }
    }
    const outcome = assessActionOutcome({
      action: action.action,
      code,
      ok: result?.ok === true,
      planId: action.planId || '',
      subscription,
    })
    return finish(
      { ...base, code, ok: result?.ok === true },
      { action: action.action, code, ok: result?.ok === true, ...outcome, status: result?.status || (result?.ok ? 200 : 500) },
    )
  }
  return finish({ ...base, code: 'UNKNOWN_ACTION' }, { code: 'UNKNOWN_ACTION', ok: false, outcome: 'failed', resolved: false, status: 400 })
}
