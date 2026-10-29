const PRODUCTION_APP_HOSTS = new Set([
  'viktkollen-app.vercel.app',
  'viktkollen-app-appsonthego-s-projects.vercel.app',
  'viktkollen-app-git-main-appsonthego-s-projects.vercel.app',
])

const MERCHANT_RESULTS = new Set(['MATCH', 'MISMATCH'])
const SANDBOX_RESULTS = new Set(['SANDBOX_TRUE', 'SANDBOX_FALSE', 'SANDBOX_UNSPECIFIED'])
const GATE_CODES = new Set([
  'AUTH_REQUIRED',
  'DIAGNOSTIC_FAILED',
  'ENV_NOT_PREVIEW',
  'FORBIDDEN',
  'GET_REQUIRED',
  'GIT_BRANCH_MISMATCH',
  'KEY_UNREADABLE',
  'LIVE_FLAG_ON',
  'MERCHANT_NOT_SANDBOX',
  'PRODUCTION_REFUSED',
  'PUBLIC_HOST_NOT_PREVIEW',
  'SUPABASE_NOT_STAGING',
])

export function previewSandboxDiagnosticEnabled(hostname = globalThis.location?.hostname || '') {
  const host = String(hostname || '').toLowerCase()
  // Git aliases start with viktkollen-app-. Deployment hosts are viktkollen-<id>-.
  if (!host.startsWith('viktkollen-') || !host.endsWith('-appsonthego-s-projects.vercel.app')) return false
  if (host.includes('git-main') || PRODUCTION_APP_HOSTS.has(host)) return false
  return true
}

export function formatSandboxDiagnosticResult(payload, status) {
  const httpStatus = Number(payload?.httpStatus)
  if (MERCHANT_RESULTS.has(payload?.merchant)
    && SANDBOX_RESULTS.has(payload?.sandbox)
    && Number.isInteger(httpStatus)) {
    return `${httpStatus} ${payload.merchant} ${payload.sandbox}`
  }
  if (GATE_CODES.has(payload?.code)) return payload.code
  if (status === 401) return 'AUTH_REQUIRED'
  if (status === 403) return 'FORBIDDEN'
  return 'DIAGNOSTIC_FAILED'
}
