const aiEndpoint = '/api/ai'

let endpointUnavailableReason = ''

function isUnavailableStatus(status) {
  return status === 404 || status === 405 || status === 501
}

function makeUnavailableResult(reason = 'Lokal AI används just nu.') {
  return {
    data: null,
    error: null,
    ok: false,
    reason,
    skipped: true,
    source: 'local',
  }
}

export function getLocalAiStatusMessage() {
  return endpointUnavailableReason || 'Lokal AI används just nu.'
}

export function isAiEndpointUnavailable() {
  return Boolean(endpointUnavailableReason)
}

export async function requestAiEndpoint(payload) {
  if (endpointUnavailableReason) {
    return makeUnavailableResult(endpointUnavailableReason)
  }

  try {
    const response = await fetch(aiEndpoint, {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })

    const data = await response.json().catch(() => ({}))

    if (isUnavailableStatus(response.status)) {
      endpointUnavailableReason = 'Lokal AI används just nu.'
      return makeUnavailableResult(endpointUnavailableReason)
    }

    if (!response.ok) {
      return {
        data,
        error: new Error(data.error || `AI-anrop misslyckades med status ${response.status}`),
        ok: false,
        reason: data.error || 'AI-tjänsten svarade inte som väntat.',
        skipped: false,
        source: 'error',
      }
    }

    return {
      data,
      error: null,
      ok: true,
      reason: '',
      skipped: false,
      source: data.source === 'openai' ? 'openai' : 'mock',
    }
  } catch (error) {
    endpointUnavailableReason = 'Lokal AI används just nu.'

    if (import.meta.env.DEV) {
      console.info('[Viktkollen AI] /api/ai är inte tillgänglig, använder lokal fallback.', {
        message: error?.message,
      })
    }

    return makeUnavailableResult(endpointUnavailableReason)
  }
}
