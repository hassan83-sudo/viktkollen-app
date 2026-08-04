import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function makeCheck(id, status, message) {
  return { id, message, status }
}

export async function verifyPhotoRoute({
  baseUrl = '',
  cwd = process.cwd(),
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
} = {}) {
  const checks = []
  const routePath = 'api/nutrition-photo-analysis/index.js'
  checks.push(existsSync(resolve(cwd, routePath))
    ? makeCheck('route-file', 'PASS', 'Nutrition photo route finns.')
    : makeCheck('route-file', 'FAIL', 'Nutrition photo route saknas.'))

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
      const response = await fetchImpl(new URL('/api/nutrition-photo-analysis', baseUrl), {
        method: 'POST',
        signal: controller.signal,
      })
      const text = await response.text()
      const leakedSecret = /sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+/i.test(text)
      checks.push([400, 415].includes(response.status)
        ? makeCheck('missing-image-contract', 'PASS', 'Tom POST ger säkert klientfel.')
        : makeCheck('missing-image-contract', 'FAIL', `Tom POST gav oväntad status ${response.status}.`))
      checks.push(leakedSecret
        ? makeCheck('secret-leak', 'FAIL', 'Response innehåller ett secret-liknande mönster.')
        : makeCheck('secret-leak', 'PASS', 'Response läcker inga uppenbara secrets.'))
    } catch (error) {
      checks.push(makeCheck('remote-request', error?.name === 'AbortError' ? 'FAIL' : 'FAIL', error?.name === 'AbortError'
        ? 'Photo route preflight timeout.'
        : 'Photo route kunde inte nås.'))
    } finally {
      clearTimeout(timer)
    }
  }

  checks.push(env.OPENAI_API_KEY
    ? makeCheck('provider-config', 'PASS', 'OPENAI_API_KEY finns server-side.')
    : makeCheck('provider-config', 'SKIP', 'OPENAI_API_KEY saknas. Riktig provider-test hoppas över.'))

  return {
    checks,
    ok: checks.every((check) => check.status !== 'FAIL'),
  }
}

export function formatPhotoRoutePreflight(result) {
  return result.checks.map((check) => `${check.status} ${check.id} - ${check.message}`).join('\n')
}

export async function runPhotoRoutePreflightCli(argv = process.argv.slice(2)) {
  const urlIndex = argv.findIndex((arg) => arg === '--url')
  const baseUrl = urlIndex >= 0 ? argv[urlIndex + 1] : ''
  const result = await verifyPhotoRoute({ baseUrl })
  console.log(formatPhotoRoutePreflight(result))
  return result.ok ? 0 : 1
}
