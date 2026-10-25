// Fail-closed Preview/Staging configuration guard. Never print credentials.
const STAGING_PROJECT = 'armtslzspuebmlysnooq'
const PRODUCTION_PROJECT = 'bxmdlckrlwzdtcxnsqqr'

function projectFromUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)
    return match?.[1] || null
  } catch {
    return null
  }
}

export function checkPreviewAuthEnvironment(env = process.env) {
  const checks = []
  const add = (id, ok, detail) => checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
  const target = env.VERCEL_ENV
  add('preview-target', target === 'preview', 'Only Preview deployments may run this guard')
  const clientProject = projectFromUrl(env.VITE_SUPABASE_URL || '')
  const serverProject = projectFromUrl(env.SUPABASE_URL || '')
  add('client-staging-project', clientProject === STAGING_PROJECT, 'Client must point to approved Staging project')
  add('server-staging-project', serverProject === STAGING_PROJECT, 'Server must point to approved Staging project')
  add('same-project', Boolean(clientProject && clientProject === serverProject), 'Client and server must use the same Supabase project')
  add('production-blocked', clientProject !== PRODUCTION_PROJECT && serverProject !== PRODUCTION_PROJECT, 'Production project is forbidden in Preview')
  add('client-anon-key', Boolean(env.VITE_SUPABASE_ANON_KEY && !/^\[SENSITIVE\]$/.test(env.VITE_SUPABASE_ANON_KEY)), 'Public anon key must be configured')
  add('server-key-not-public', !env.VITE_SUPABASE_SERVICE_ROLE_KEY, 'Service role key must never be exposed via VITE_')
  return { ok: checks.every((check) => check.status === 'PASS'), checks }
}

export function runPreviewAuthPreflight(env = process.env) {
  const result = checkPreviewAuthEnvironment(env)
  for (const check of result.checks) console.log(`${check.status} ${check.id}: ${check.detail}`)
  console.log(result.ok ? 'PREVIEW AUTH CONFIG PASS' : 'PREVIEW AUTH CONFIG FAIL — do not run login tests')
  return result.ok ? 0 : 1
}
