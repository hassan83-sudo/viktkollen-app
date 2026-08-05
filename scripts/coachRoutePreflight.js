import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function makeCheck(id, status, message) {
  return { id, message, status }
}

export async function verifyCoachRoute({
  baseUrl = '',
  cwd = process.cwd(),
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
} = {}) {
  const checks = []
  const routePath = 'api/adaptive-coach/index.js'
  const routeFile = resolve(cwd, routePath)
  checks.push(existsSync(routeFile)
    ? makeCheck('route-file', 'PASS', 'Adaptive coach route finns.')
    : makeCheck('route-file', 'FAIL', 'Adaptive coach route saknas.'))
  if (existsSync(routeFile)) {
    const source = readFileSync(routeFile, 'utf8')
    checks.push(source.includes('verifySupabaseUser')
      ? makeCheck('auth-required', 'PASS', 'Route kräver server-side authverifiering.')
      : makeCheck('auth-required', 'FAIL', 'Route saknar server-side authverifiering.'))
    checks.push(source.includes('setNoStoreHeaders') || source.includes('sendSafeAiError')
      ? makeCheck('no-store-contract', 'PASS', 'Route har no-store-kontrakt.')
      : makeCheck('no-store-contract', 'FAIL', 'Route saknar no-store-kontrakt.'))
  }

  checks.push(env.OPENAI_API_KEY
    ? makeCheck('provider-config', 'PASS', 'OPENAI_API_KEY finns server-side.')
    : makeCheck('provider-config', 'SKIP', 'OPENAI_API_KEY saknas. Riktig provider-test hoppas över.'))

  if (!baseUrl) {
    checks.push(makeCheck('remote-contract', 'SKIP', 'Ingen URL angavs. Kör med --url för remote preflight.'))
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    checks.push(makeCheck('remote-url', 'FAIL', 'URL måste vara http eller https.'))
  } else if (typeof fetchImpl !== 'function') {
    checks.push(makeCheck('fetch', 'FAIL', 'fetch saknas i runtime.'))
  } else {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(new URL('/api/adaptive-coach', baseUrl), {
        body: JSON.stringify({ consent: true, confidence: 0.8, coverage: 0.8 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      })
      const text = await response.text()
      checks.push(response.status === 401
        ? makeCheck('missing-auth-contract', 'PASS', 'Saknad auth ger 401 utan providerkörning.')
        : makeCheck('safe-contract', 'FAIL', `Route gav oväntad status ${response.status}.`))
      checks.push(/no-store/i.test(response.headers.get('cache-control') || '')
        ? makeCheck('no-store-header', 'PASS', 'Route svarar med no-store.')
        : makeCheck('no-store-header', 'FAIL', 'Route saknar no-store-header.'))
      checks.push(/"code"|"safeMessage"|"requestId"/.test(text)
        ? makeCheck('safe-error-schema', 'PASS', 'Route använder säkert felschema.')
        : makeCheck('safe-error-schema', 'FAIL', 'Route svarar inte med väntat felschema.'))
      checks.push(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+/i.test(text)
        ? makeCheck('secret-leak', 'FAIL', 'Response innehåller secret-liknande mönster.')
        : makeCheck('secret-leak', 'PASS', 'Response läcker inga uppenbara secrets.'))
    } catch (error) {
      checks.push(makeCheck('remote-request', 'FAIL', error?.name === 'AbortError'
        ? 'Coach route preflight timeout.'
        : 'Coach route kunde inte nås.'))
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    checks,
    ok: checks.every((check) => check.status !== 'FAIL'),
  }
}

export function formatCoachRoutePreflight(result) {
  return result.checks.map((check) => `${check.status} ${check.id} - ${check.message}`).join('\n')
}

export async function runCoachRoutePreflightCli(argv = process.argv.slice(2)) {
  const urlIndex = argv.findIndex((arg) => arg === '--url')
  const baseUrl = urlIndex >= 0 ? argv[urlIndex + 1] : ''
  const result = await verifyCoachRoute({ baseUrl })
  console.log(formatCoachRoutePreflight(result))
  return result.ok ? 0 : 1
}
