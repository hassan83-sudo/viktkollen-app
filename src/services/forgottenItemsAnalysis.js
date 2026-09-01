import {
  analysisConsentPurposes,
  requestAnalysisConsentToken,
  withAnalysisConsentTokenHeader,
} from './security/analysisConsentProof.js'
import {
  getCurrentAiAuthorization,
  hasSameAiAuthUser,
} from './ai/aiAuthTransport.js'

/**
 * Client-side call for Smart kamera -> "Har jag glömt något?"'s optional
 * remote AI object check.
 *
 * This is the ONLY place in the smart-camera feature that turns a
 * captured video frame into bytes and sends it anywhere - see the module
 * doc comment in features/smart-camera/components/ForgottenItemsCheck.jsx
 * for why that split exists (it keeps every smart-camera UI file free of
 * any upload/capture code, so the existing static hardening scan in
 * smartCameraSecurity.test.jsx keeps meaning what it says for every mode
 * except this one explicit, consented exception).
 *
 * Fails closed for ANY reason - missing explicit approval, no auth,
 * consent denied, offline, timeout, malformed AI response - by returning
 * { ok: false, reason } and NEVER throwing. Callers must treat ok:false
 * as "stay on the manual checklist, nothing was confirmed either way",
 * never as proof anything is missing.
 *
 * Nothing in this module logs the canvas, the blob, its base64 form, the
 * image bytes, or the consent token - only generic reason codes.
 */

export const forgottenItemsAnalysisTimeoutMs = 20000
const ANALYSIS_ENDPOINT = '/api/forgotten-items-analysis'
const MAX_ITEMS = 25

function timeoutSignal(ms, upstreamSignal) {
  if (typeof AbortController === 'undefined') {
    return { cleanup: () => {}, signal: undefined }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('clientTimeout'), ms)
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason || 'explicitAbort')
  if (upstreamSignal?.aborted) abortFromUpstream()
  upstreamSignal?.addEventListener?.('abort', abortFromUpstream, { once: true })

  return {
    cleanup: () => {
      clearTimeout(timer)
      upstreamSignal?.removeEventListener?.('abort', abortFromUpstream)
    },
    signal: controller.signal,
  }
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== 'function') {
      reject(new Error('capture_unavailable'))
      return
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('capture_failed'))
    }, type, quality)
  })
}

function safeItemsForRequest(items = []) {
  return items.slice(0, MAX_ITEMS).map((item) => ({
    id: String(item?.id || ''),
    label: String(item?.label || '').trim().slice(0, 60),
  })).filter((item) => item.id && item.label)
}

/**
 * @param {object} params
 * @param {HTMLCanvasElement} params.canvas - one already-captured frame (see
 *   SmartCameraLiveView.captureFrame via a forwarded ref); never a live
 *   video element or MediaStream.
 * @param {boolean} params.consentApproved - must be exactly `true`, set only
 *   from inside the real "skicka bilden" approval tap.
 * @param {Array<{id: string, label: string}>} params.items - the checklist
 *   entries to ask about; only id+label are sent, nothing else.
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ok: true, result: {items: Array<{id, status}>}} | {ok: false, reason: string}>}
 */
export async function analyzeForgottenItemsPhoto({ canvas, consentApproved, items, signal } = {}) {
  if (consentApproved !== true) {
    return { ok: false, reason: 'consent_not_approved' }
  }
  const requestedItems = safeItemsForRequest(items)
  if (!requestedItems.length) {
    return { ok: false, reason: 'items_required' }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, reason: 'offline' }
  }

  let blob
  try {
    blob = await canvasToBlob(canvas)
  } catch {
    return { ok: false, reason: 'capture_failed' }
  }

  const auth = await getCurrentAiAuthorization()
  if (!auth.ok) {
    return { ok: false, reason: auth.errorCode || 'auth_unavailable' }
  }

  const timeout = timeoutSignal(forgottenItemsAnalysisTimeoutMs, signal)

  try {
    let consentToken
    try {
      consentToken = await requestAnalysisConsentToken({
        authorizationHeader: auth.authorizationHeader,
        consentApproved,
        images: blob,
        purpose: analysisConsentPurposes.forgottenItemsAnalysis,
        signal: timeout.signal,
      })
    } catch {
      return { ok: false, reason: 'consent_token_denied' }
    }

    const formData = new FormData()
    formData.append('items', JSON.stringify(requestedItems))
    formData.append('image', blob, 'forgotten-items.jpg')

    const response = await fetch(ANALYSIS_ENDPOINT, {
      body: formData,
      headers: withAnalysisConsentTokenHeader({
        Authorization: auth.authorizationHeader,
      }, consentToken.token),
      method: 'POST',
      signal: timeout.signal,
    })

    if (!await hasSameAiAuthUser(auth.userScope)) {
      return { ok: false, reason: 'auth_stale' }
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      return { ok: false, reason: 'invalid_response' }
    }

    if (!response.ok || payload?.ok === false || !Array.isArray(payload?.result?.items)) {
      return { ok: false, reason: payload?.error?.code || `http_${response.status}` }
    }

    return { ok: true, result: payload.result }
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network_error' }
  } finally {
    timeout.cleanup()
  }
}
