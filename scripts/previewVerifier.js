import process from 'node:process'

const forbiddenPreloadPattern = /DataImportCenter|DataExportCenter|AchievementCenter|SocialCenter|NotificationCenter|InsightsCenter|CoachPlanCenter|CloudBackupPanel|ReminderCenter/
const secretPattern = /sk-[A-Za-z0-9_-]{8,}|service[_-]?role|SUPABASE_SERVICE_ROLE|OPENAI_API_KEY/i

function makeCheck(id, status, message) {
  return { id, message, status }
}

async function fetchText(fetchImpl, url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    return { response, text: await response.text() }
  } finally {
    clearTimeout(timer)
  }
}

export async function verifyPreviewDeployment({
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
  url,
} = {}) {
  const checks = []

  if (!url) {
    return {
      checks: [makeCheck('preview-url', 'FAIL', 'Preview-URL saknas.')],
      ok: false,
    }
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return {
      checks: [makeCheck('preview-url', 'FAIL', 'Preview-URL är ogiltig.')],
      ok: false,
    }
  }

  checks.push(parsed.protocol === 'https:'
    ? makeCheck('https', 'PASS', 'Preview använder HTTPS.')
    : makeCheck('https', 'FAIL', 'Preview måste använda HTTPS.'))

  try {
    const index = await fetchText(fetchImpl, parsed, timeoutMs)
    checks.push(index.response.ok
      ? makeCheck('index', 'PASS', 'Index laddas.')
      : makeCheck('index', 'FAIL', `Index gav status ${index.response.status}.`))
    checks.push(forbiddenPreloadPattern.test(index.text)
      ? makeCheck('modulepreload', 'FAIL', 'Förbjuden lazy chunk hittades i index.')
      : makeCheck('modulepreload', 'PASS', 'Inga förbjudna lazy chunks i index.'))
    checks.push(secretPattern.test(index.text)
      ? makeCheck('client-secrets', 'FAIL', 'Secret-liknande mönster hittades i index.')
      : makeCheck('client-secrets', 'PASS', 'Inga uppenbara secrets hittades i index.'))
  } catch (error) {
    checks.push(makeCheck('index', 'FAIL', error?.name === 'AbortError' ? 'Index timeout.' : 'Index kunde inte laddas.'))
  }

  for (const [id, path] of [
    ['manifest', '/manifest.webmanifest'],
    ['service-worker', '/sw.js'],
    ['icon-192', '/pwa-icon-192.png'],
    ['icon-512', '/pwa-icon-512.png'],
    ['api-coach-route', '/api/adaptive-coach'],
    ['api-photo-route', '/api/nutrition-photo-analysis'],
  ]) {
    try {
      const target = new URL(path, parsed)
      const result = await fetchText(fetchImpl, target, timeoutMs)
      checks.push(result.response.status < 500
        ? makeCheck(id, 'PASS', `${path} svarar utan serverfel.`)
        : makeCheck(id, 'FAIL', `${path} gav serverfel ${result.response.status}.`))
    } catch (error) {
      checks.push(makeCheck(id, 'FAIL', error?.name === 'AbortError' ? `${path} timeout.` : `${path} kunde inte laddas.`))
    }
  }

  return {
    checks,
    ok: checks.every((check) => check.status !== 'FAIL'),
  }
}

export function formatPreviewVerification(result) {
  return result.checks.map((check) => `${check.status} ${check.id} - ${check.message}`).join('\n')
}

export async function runPreviewVerifierCli(argv = process.argv.slice(2)) {
  const url = argv[0] || ''
  const result = await verifyPreviewDeployment({ url })
  console.log(formatPreviewVerification(result))
  return result.ok ? 0 : 1
}
