import { sanitizeAiAction } from '../../../src/features/aiHelp/aiActions.js'
import { executeUserBillingIntent } from '../billing/userLifecycleIntent.js'
import { recordAiAction } from './actionAudit.js'

function finish(entry, result) {
  recordAiAction(entry)
  return result
}

export async function executeConfirmedAiAction({
  actionId,
  actorUserId,
  confirmed = false,
  execute = executeUserBillingIntent,
  planId = '',
} = {}) {
  const requestedId = typeof actionId === 'string' ? actionId : actionId?.action || actionId?.id
  const action = sanitizeAiAction({
    action: requestedId,
    planId: planId || (typeof actionId === 'object' && actionId ? actionId.planId || actionId.plan_id : ''),
  })
  const base = { action: action?.action || 'rejected', actorUserId }
  if (!actorUserId) {
    return finish({ ...base, code: 'AUTH_REQUIRED' }, { code: 'AUTH_REQUIRED', ok: false, status: 401 })
  }
  if (!action) {
    return finish({ ...base, code: 'UNKNOWN_ACTION' }, { code: 'UNKNOWN_ACTION', ok: false, status: 400 })
  }
  if (action.sensitive && confirmed !== true) {
    return finish({ ...base, code: 'CONFIRMATION_REQUIRED' }, { code: 'CONFIRMATION_REQUIRED', ok: false, status: 409 })
  }
  if (action.action === 'plan_change' || action.action === 'schedule_cancel' || action.action === 'undo_cancel') {
    const body = action.action === 'plan_change' ? { plan_id: action.planId } : {}
    const result = await execute({ action: action.action, body, userId: actorUserId })
    const code = result?.ok ? 'completed' : (result?.code || 'BILLING_FAILED')
    return finish(
      { ...base, code, ok: result?.ok === true },
      { action: action.action, code, ok: result?.ok === true, status: result?.status || (result?.ok ? 200 : 500) },
    )
  }
  return finish({ ...base, code: 'UNKNOWN_ACTION' }, { code: 'UNKNOWN_ACTION', ok: false, status: 400 })
}
