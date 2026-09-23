import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import {
  getBillingAdminService,
  requireBillingAdmin,
  resolveBillingControlAdapter,
  toClientSafeAdminSession,
  toClientSafeControl,
} from '../../_shared/billing/admin.js'
import {
  ADMIN_AUDIT_REASONS,
  FEATURE_CONTROL_REASONS,
  PROVIDER_CONTROL_REASONS,
} from '../../../src/services/billing/catalog.js'
import {
  assertOperableFeatureKillSwitch,
  assertOperableProviderKillSwitch,
  defaultKillSwitchReason,
  KILL_SWITCH_ACTION,
} from '../../../src/services/billing/billingKillSwitch.js'
import { rejectPlanCommercialOverrides } from '../../../src/services/billing/planCommercialControl.js'

function readBody(request) {
  if (!request.body) return {}
  if (typeof request.body === 'object') return request.body
  try {
    return JSON.parse(request.body)
  } catch {
    return {}
  }
}

function parseExpectedVersion(value) {
  if (value == null || value === '') return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

function storeUnavailable(response, requestId) {
  return response.status(503).json({
    error: { code: 'ADMIN_STORE_UNAVAILABLE' },
    ok: false,
    requestId,
  })
}

function respondPlanCommercial(response, requestId, result) {
  if (!result?.ok) {
    if (result?.code === 'forbidden_admin') {
      return response.status(403).json({
        error: { code: 'FORBIDDEN' },
        ok: false,
        requestId,
      })
    }
    if (result?.code === 'CONFIG_CONFLICT') {
      return response.status(409).json({
        error: { code: 'CONFIG_CONFLICT' },
        ok: false,
        requestId,
      })
    }
    if (result?.code === 'PLAN_STATE_UNAVAILABLE' || result?.code === 'PLAN_WRITE_FAILED') {
      return storeUnavailable(response, requestId)
    }
    return response.status(400).json({
      error: { code: result?.code || 'INVALID_ADMIN_REQUEST' },
      ok: false,
      requestId,
    })
  }
  return response.status(200).json({
    ok: true,
    plans: result.plans,
    requestId,
  })
}

function planCommercialCommand(body, action) {
  const code = rejectPlanCommercialOverrides(body, action)
  if (code) return { ok: false, code }
  if (body.expected_version == null || body.expected_version === '') {
    return { ok: false, code: 'invalid_plan_control' }
  }
  const expectedVersion = parseExpectedVersion(body.expected_version)
  if (expectedVersion == null) return { ok: false, code: 'invalid_plan_control' }
  const command = {
    action,
    enabled_for_sale: body.enabled_for_sale,
    expected_version: expectedVersion,
    plan_id: String(body.plan_id || '').trim(),
  }
  if (action === 'move_plan_display_order') command.direction = body.direction
  return { command, ok: true }
}

function invalidAdmin(response, requestId, code = 'INVALID_ADMIN_REQUEST') {
  return response.status(400).json({
    error: { code },
    ok: false,
    requestId,
  })
}

export default async function handler(request, response) {
  const requestId = `bill-admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast GET och POST stöds.',
      status: 405,
    })
  }

  const admin = await requireBillingAdmin(request, { requestId })
  if (!admin.ok) {
    return response.status(admin.status).json({
      error: admin.error,
      ok: false,
      requestId,
    })
  }

  if (request.method === 'GET') {
    void request.query?.enabled_for_sale
    void request.query?.plan_id
    void request.query?.price_sek_minor
    if (request.query?.resource === 'plan_commercial') {
      const controls = resolveBillingControlAdapter()
      if (!controls || typeof controls.listPlanCommercial !== 'function') {
        return storeUnavailable(response, requestId)
      }
      const listed = await controls.listPlanCommercial(admin.user.id)
      return respondPlanCommercial(response, requestId, listed)
    }
    return response.status(200).json({
      ok: true,
      requestId,
      session: toClientSafeAdminSession(admin),
    })
  }

  const body = readBody(request)
  const action = String(body.action || '').trim()
  const targetUserId = String(body.target_user_id || '').trim()
  const reasonCode = ADMIN_AUDIT_REASONS.includes(body.reason_code) ? body.reason_code : 'MANUAL_ADMIN'
  void request.query
  void body.admin_user_id
  void body.isAdmin
  void body.role
  void body.billing_admin
  void body.rpc
  void body.schema
  void body.table
  void body.sql
  void body.api_key
  void body.localStorage
  void body.price_sek_minor
  void body.entitlements
  void body.quotas

  const service = getBillingAdminService()
  try {
    if (action === 'grant') {
      const result = await service.grant({
        actorUserId: admin.user.id,
        clientClaim: body,
        reasonCode,
        targetUserId,
      })
      return response.status(200).json({
        ok: true,
        permission: result.permission.status,
        requestId,
      })
    }
    if (action === 'revoke') {
      const result = await service.revoke({
        actorUserId: admin.user.id,
        clientClaim: body,
        reasonCode: reasonCode === 'MANUAL_ADMIN' ? 'SECURITY' : reasonCode,
        targetUserId,
      })
      return response.status(200).json({
        ok: true,
        permission: result.permission.status,
        requestId,
      })
    }
    if (action === 'set_plan_availability' || action === 'move_plan_display_order') {
      const controls = resolveBillingControlAdapter()
      const method = action === 'set_plan_availability' ? 'setPlanAvailability' : 'movePlanDisplayOrder'
      if (!controls || typeof controls[method] !== 'function') {
        return storeUnavailable(response, requestId)
      }
      const parsed = planCommercialCommand(body, action)
      if (!parsed.ok) return respondPlanCommercial(response, requestId, parsed)
      const written = await controls[method](admin.user.id, parsed.command)
      if (written?.ok) {
        console.info('[api/billing/admin] Plan', {
          action,
          field: action === 'set_plan_availability' ? 'enabled_for_sale' : 'display_order',
          plan_id: parsed.command.plan_id,
          requestId,
        })
      }
      return respondPlanCommercial(response, requestId, written)
    }
    if (action === 'set_feature_control' || action === KILL_SWITCH_ACTION.SET_FEATURE_CONTROL) {
      const controls = resolveBillingControlAdapter()
      if (!controls || typeof controls.setFeatureControl !== 'function') {
        return storeUnavailable(response, requestId)
      }
      const expectedVersion = parseExpectedVersion(body.expected_version)
      if (expectedVersion == null) return invalidAdmin(response, requestId)
      const selected = assertOperableFeatureKillSwitch({
        featureId: body.feature_id,
        mode: body.mode,
      })
      let nextReason = defaultKillSwitchReason({ kind: 'feature', mode: selected.mode })
      if (body.reason_code != null && String(body.reason_code).trim() !== '') {
        if (!FEATURE_CONTROL_REASONS.includes(body.reason_code)) return invalidAdmin(response, requestId)
        nextReason = body.reason_code
      }
      const written = await controls.setFeatureControl({
        actorUserId: admin.user.id,
        expectedVersion,
        featureId: selected.featureId,
        mode: selected.mode,
        reasonCode: nextReason,
      })
      const confirmed = await controls.getFeatureControl(selected.featureId)
      console.info('[api/billing/admin] Control', {
        action,
        admin_user_ref: admin.user.id,
        feature_id: selected.featureId,
        mode: selected.mode,
        requestId,
      })
      return response.status(200).json({
        control: toClientSafeControl(confirmed || written),
        ok: true,
        requestId,
      })
    }
    if (action === 'set_provider_control' || action === KILL_SWITCH_ACTION.SET_PROVIDER_CONTROL) {
      const controls = resolveBillingControlAdapter()
      if (!controls || typeof controls.setProviderControl !== 'function') {
        return storeUnavailable(response, requestId)
      }
      const expectedVersion = parseExpectedVersion(body.expected_version)
      if (expectedVersion == null) return invalidAdmin(response, requestId)
      const selected = assertOperableProviderKillSwitch({
        mode: body.mode,
        providerId: body.provider_id,
      })
      let nextReason = defaultKillSwitchReason({ kind: 'provider', mode: selected.mode })
      if (body.reason_code != null && String(body.reason_code).trim() !== '') {
        if (!PROVIDER_CONTROL_REASONS.includes(body.reason_code)) return invalidAdmin(response, requestId)
        nextReason = body.reason_code
      }
      const written = await controls.setProviderControl({
        actorUserId: admin.user.id,
        expectedVersion,
        mode: selected.mode,
        providerId: selected.providerId,
        reasonCode: nextReason,
      })
      const confirmed = await controls.getProviderControl(selected.providerId)
      console.info('[api/billing/admin] Control', {
        action,
        admin_user_ref: admin.user.id,
        mode: selected.mode,
        provider_id: selected.providerId,
        requestId,
      })
      return response.status(200).json({
        control: toClientSafeControl(confirmed || written),
        ok: true,
        requestId,
      })
    }
  } catch (error) {
    if (error?.code === 'unknown_feature' || error?.code === 'unknown_provider') {
      return invalidAdmin(response, requestId, error.code === 'unknown_feature' ? 'UNKNOWN_FEATURE' : 'UNKNOWN_PROVIDER')
    }
    if (error?.code === 'invalid_feature_mode' || error?.code === 'invalid_provider_mode') {
      return invalidAdmin(response, requestId, 'INVALID_CONTROL_STATE')
    }
    if (error?.code === 'admin_store_unavailable' || error?.code === 'billing_rpc_failed') {
      return storeUnavailable(response, requestId)
    }
    return invalidAdmin(response, requestId)
  }

  return sendSafeAiError(response, {
    code: aiRouteErrorCodes.INVALID_REQUEST,
    requestId,
    safeMessage: 'Ogiltig adminåtgärd.',
    status: 400,
  })
}
