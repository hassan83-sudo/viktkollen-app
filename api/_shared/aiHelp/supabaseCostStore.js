const COST_URL_ENV = 'AI_HELP_COST_SUPABASE_URL'
const COST_KEY_ENV = 'AI_HELP_COST_SUPABASE_SERVICE_ROLE_KEY'

export function unavailableCostStore() {
  return {
    async listOutstanding() {
      return { ok: false, reason: 'store_unavailable', reservations: [] }
    },
    async markUncertain() {
      return { ok: false, reason: 'store_unavailable' }
    },
    async release() {
      return { ok: false, reason: 'store_unavailable' }
    },
    async reserve() {
      return { ok: false, reason: 'store_unavailable', retryAfterSeconds: 60 }
    },
    async resolve() {
      return { ok: false, reason: 'store_unavailable' }
    },
    async settle() {
      return { ok: false, reason: 'store_unavailable' }
    },
  }
}

function costCredentials(env) {
  const url = String(env?.[COST_URL_ENV] || '').trim()
  const serviceRoleKey = String(env?.[COST_KEY_ENV] || '').trim()
  const exposedKey = Object.keys(env || {}).find((name) => (
    /^VITE_.*SERVICE_ROLE/i.test(name) && String(env[name] || '').trim()
  ))
  if (!url || !serviceRoleKey || exposedKey) return null
  if (!url.startsWith('https://') || url.includes(serviceRoleKey)) return null
  return { serviceRoleKey, url: url.replace(/\/$/, '') }
}

function outstandingReservations(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const reservationId = String(item?.reservationId || '')
    const userHash = String(item?.userHash || '')
    if (!/^[0-9a-f-]{36}$/i.test(reservationId) || !/^[0-9a-f]{24}$/.test(userHash)) return []
    if (item?.status !== 'reserved' && item?.status !== 'uncertain') return []
    const status = item.status
    return [{
      holdSek: Number(item.holdSek) || 0,
      periodId: /^[0-9a-f-]{36}$/i.test(String(item.periodId || '')) ? String(item.periodId) : '',
      reservationId,
      status,
      userHash,
    }]
  })
}

async function callCostFunction({ fetchImpl, functionName, payload, serviceRoleKey, url }) {
  let response
  try {
    response = await fetchImpl(`${url}/rest/v1/rpc/${functionName}`, {
      body: JSON.stringify(payload),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  } catch {
    return { ok: false, reason: 'store_unavailable', retryAfterSeconds: 60 }
  }

  if (!response.ok) return { ok: false, reason: 'store_unavailable', retryAfterSeconds: 60 }
  try {
    const body = await response.json()
    if (!body || typeof body !== 'object') return { ok: false, reason: 'store_unavailable' }
    const knownReasons = new Set([
      'budget',
      'budget_not_configured',
      'conflict',
      'cost_deviation',
      'invalid_hash',
      'invalid_hold',
      'invalid_request',
      'invalid_usage',
      'missing_reservation',
      'not_open',
      'user_limit',
    ])
    const reservationId = String(body.reservationId || body.reservation_id || '')
    return {
      duplicate: Boolean(body.duplicate),
      ok: body.ok === true,
      reason: body.ok === true ? '' : (knownReasons.has(body.reason) ? body.reason : 'store_unavailable'),
      reservationId: /^[0-9a-f-]{36}$/i.test(reservationId) ? reservationId : '',
      reservations: outstandingReservations(body.reservations),
      retryAfterSeconds: Number(body.retryAfterSeconds || body.retry_after_seconds) || undefined,
    }
  } catch {
    return { ok: false, reason: 'store_unavailable', retryAfterSeconds: 60 }
  }
}

export function createSupabaseCostStore({ fetchImpl = fetch, serviceRoleKey, url }) {
  const endpoint = url.replace(/\/$/, '')
  return {
    listOutstanding: (input = {}) => callCostFunction({
      fetchImpl,
      functionName: 'ai_help_list_outstanding_reservations',
      payload: { p_older_than_seconds: input.olderThanSeconds ?? 120 },
      serviceRoleKey,
      url: endpoint,
    }),
    markUncertain: (input) => callCostFunction({
      fetchImpl,
      functionName: 'ai_help_mark_model_call_uncertain',
      payload: { p_reservation_id: input.reservationId },
      serviceRoleKey,
      url: endpoint,
    }),
    release: (input) => callCostFunction({
      fetchImpl,
      functionName: 'ai_help_resolve_model_call',
      payload: {
        p_action: 'release',
        p_reason: input.reason,
        p_reservation_id: input.reservationId,
      },
      serviceRoleKey,
      url: endpoint,
    }),
    reserve: (input) => callCostFunction({
      fetchImpl,
      functionName: 'ai_help_reserve_model_call',
      payload: {
        p_budget_sek: input.budgetSek,
        p_max_input_tokens: input.maxInputTokens,
        p_max_output_tokens: input.maxOutputTokens,
        p_period_seconds: input.periodSeconds,
        p_sek_per_usd: input.sekPerUsd,
        p_user_hash: input.userHash,
        p_user_limit: input.userLimit,
        p_window_seconds: input.windowSeconds,
      },
      serviceRoleKey,
      url: endpoint,
    }),
    resolve: (input) => callCostFunction({
      fetchImpl,
      functionName: 'ai_help_resolve_model_call',
      payload: {
        p_action: input.action,
        p_input_tokens: input.inputTokens,
        p_output_tokens: input.outputTokens,
        p_reason: input.reason,
        p_reasoning_tokens: input.reasoningTokens,
        p_reservation_id: input.reservationId,
      },
      serviceRoleKey,
      url: endpoint,
    }),
    settle: (input) => callCostFunction({
      fetchImpl,
      functionName: 'ai_help_settle_model_call',
      payload: {
        p_input_tokens: input.inputTokens,
        p_output_tokens: input.outputTokens,
        p_reasoning_tokens: input.reasoningTokens || 0,
        p_reservation_id: input.reservationId,
      },
      serviceRoleKey,
      url: endpoint,
    }),
  }
}

export function createCostStoreFromEnv(env = process.env, fetchImpl = fetch) {
  const credentials = costCredentials(env)
  if (!credentials) return unavailableCostStore()
  return createSupabaseCostStore({ fetchImpl, ...credentials })
}
