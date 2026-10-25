// Fail-closed Preview authentication guard. Never print credentials or tokens.
const STAGING_PROJECT = 'armtslzspuebmlysnooq'
const PRODUCTION_PROJECT = 'bxmdlckrlwzdtcxnsqqr'
const PROTECTED_PATH = '/api/billing/admin'

function projectFromUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)
    return match?.[1] || null
  } catch {
    return null
  }
}

function readJwtClaims(token) {
  const parts = String(token || '').split('.')
  if (parts.length < 3 || !parts[1]) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (!payload || typeof payload !== 'object') return null
    return {
      ref: typeof payload.ref === 'string' ? payload.ref : '',
      role: typeof payload.role === 'string' ? payload.role : '',
    }
  } catch {
    return null
  }
}

function add(checks, id, ok, detail) {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
}

function present(value) {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== '[SENSITIVE]'
}

export function checkPreviewAuthEnvironment(env = process.env) {
  const checks = []
  const clientUrl = env.VITE_SUPABASE_URL || ''
  const serverUrl = env.SUPABASE_URL || ''
  const anonKey = env.VITE_SUPABASE_ANON_KEY || ''
  const serverAnon = env.SUPABASE_ANON_KEY || ''
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || ''
  const clientProject = projectFromUrl(clientUrl)
  const serverProject = projectFromUrl(serverUrl)
  const anonClaims = readJwtClaims(anonKey)
  const serviceClaims = readJwtClaims(serviceKey)
  const exposedService = Object.keys(env).find((key) => /^VITE_.*SERVICE_ROLE/i.test(key) && present(env[key]))

  add(checks, 'preview-target', env.VERCEL_ENV === 'preview', 'Only Preview deployments may run this guard')
  add(checks, 'client-staging-project', clientProject === STAGING_PROJECT, 'Client must point to approved Staging project')
  add(checks, 'server-staging-project', serverProject === STAGING_PROJECT, 'Server must point to approved Staging project')
  add(checks, 'same-project', Boolean(clientProject && clientProject === serverProject), 'Client and server must use the same Supabase project')
  const productionInKeys = [anonClaims?.ref, serviceClaims?.ref, readJwtClaims(serverAnon)?.ref].includes(PRODUCTION_PROJECT)
    || [anonKey, serviceKey, serverAnon].some((value) => String(value || '').includes(PRODUCTION_PROJECT))
  add(checks, 'production-blocked', clientProject !== PRODUCTION_PROJECT && serverProject !== PRODUCTION_PROJECT && !productionInKeys, 'Production project is forbidden in Preview')
  add(checks, 'client-anon-key', present(anonKey), 'Public anon key must be configured')
  add(checks, 'client-anon-project', !anonClaims || (anonClaims.ref === STAGING_PROJECT && anonClaims.role === 'anon'), 'Public anon key must belong to Staging and stay an anon key')
  add(checks, 'server-anon-project', !present(serverAnon) || !readJwtClaims(serverAnon) || (readJwtClaims(serverAnon).ref === STAGING_PROJECT && readJwtClaims(serverAnon).role === 'anon'), 'Server anon key must belong to Staging when it is a JWT')
  add(checks, 'server-service-role', present(serviceKey) && !exposedService && (!serviceClaims || (serviceClaims.ref === STAGING_PROJECT && serviceClaims.role === 'service_role')), 'Staging service role must be configured only as a server secret')
  add(checks, 'server-key-not-public', !exposedService, 'Service role key must never be exposed via VITE_')
  add(checks, 'required-env', [clientUrl, serverUrl, anonKey, serviceKey].every((value) => present(value)), 'Client URL, server URL, anon key, and service role must all be present')
  return { ok: checks.every((check) => check.status === 'PASS'), checks }
}

export function inspectPreviewClientBundle(texts) {
  const combined = (Array.isArray(texts) ? texts : [texts]).join('\n')
  const hosts = new Set()
  for (const match of combined.matchAll(/https:\/\/([a-z0-9]{8,40})\.supabase\.co/g)) hosts.add(match[1])
  const jwtRoles = []
  for (const match of combined.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) {
    const claims = readJwtClaims(match[0])
    if (claims?.ref) {
      hosts.add(claims.ref)
      jwtRoles.push(claims.role)
    }
  }
  const checks = []
  add(checks, 'client-bundle-staging', hosts.has(STAGING_PROJECT), 'Built client must contain the Staging project')
  add(checks, 'client-bundle-production-blocked', !combined.includes(PRODUCTION_PROJECT), 'Built client must not contain the Production project')
  add(checks, 'client-bundle-single-project', [...hosts].every((ref) => ref === STAGING_PROJECT), 'Built client must not contain another Supabase project')
  add(checks, 'client-secrets-hidden', !jwtRoles.includes('service_role'), 'Built client must not contain a service-role token')
  return { ok: checks.every((check) => check.status === 'PASS'), checks, projects: [...hosts] }
}

export function extractPreviewAssetPaths(html) {
  return [...new Set([...String(html || '').matchAll(/\/assets\/[A-Za-z0-9._-]+\.js/g)].map((match) => match[0]))]
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function checkAuthServiceReachable({ fetchImpl = globalThis.fetch, supabaseUrl } = {}) {
  const project = projectFromUrl(supabaseUrl)
  if (project !== STAGING_PROJECT) {
    return { ok: false, checks: [{ id: 'auth-reachable', status: 'FAIL', detail: 'Auth reachability is only allowed for the Staging project' }] }
  }
  try {
    const response = await fetchImpl(`${new URL(supabaseUrl).origin}/auth/v1/health`, { method: 'GET', redirect: 'manual' })
    const reachable = response.status > 0 && response.status < 500
    return {
      ok: reachable,
      checks: [{ id: 'auth-reachable', status: reachable ? 'PASS' : 'FAIL', detail: reachable ? 'Staging Auth responded' : 'Staging Auth is unavailable' }],
    }
  } catch {
    return { ok: false, checks: [{ id: 'auth-reachable', status: 'FAIL', detail: 'Staging Auth is unavailable' }] }
  }
}

export async function checkStagingTestLogin({
  fetchImpl = globalThis.fetch,
  supabaseUrl,
  anonKey,
  email = '',
  password = '',
} = {}) {
  if (projectFromUrl(supabaseUrl) !== STAGING_PROJECT || String(supabaseUrl).includes(PRODUCTION_PROJECT) || String(anonKey || '').includes(PRODUCTION_PROJECT)) {
    return { ok: false, attempted: false, accessToken: '', checks: [{ id: 'staging-login', status: 'FAIL', detail: 'Login was not attempted because the target is not Staging' }] }
  }
  if (!present(email) || !present(password) || !present(anonKey)) {
    return { ok: false, attempted: false, accessToken: '', checks: [{ id: 'staging-test-account', status: 'FAIL', detail: 'Dedicated Staging test account is not configured' }] }
  }
  let response
  try {
    response = await fetchImpl(`${new URL(supabaseUrl).origin}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    return { ok: false, attempted: true, accessToken: '', checks: [{ id: 'staging-login', status: 'FAIL', detail: 'Staging Auth is unavailable' }] }
  }
  if (response.status >= 500) {
    return { ok: false, attempted: true, accessToken: '', checks: [{ id: 'staging-login', status: 'FAIL', detail: 'Staging Auth is unavailable' }] }
  }
  const body = await readJson(response)
  if (response.status === 400 || response.ok !== true) {
    const message = String(body?.error_description || body?.msg || body?.error_code || '')
    const detail = /email not confirmed/i.test(message)
      ? 'Staging test account email is not confirmed'
      : 'Staging test account authentication failed'
    return { ok: false, attempted: true, accessToken: '', checks: [{ id: 'staging-login', status: 'FAIL', detail }] }
  }
  if (!present(body?.access_token)) {
    return { ok: false, attempted: true, accessToken: '', checks: [{ id: 'staging-login', status: 'FAIL', detail: 'Staging test account authentication failed' }] }
  }
  return {
    ok: true,
    attempted: true,
    accessToken: body.access_token,
    checks: [{ id: 'staging-login', status: 'PASS', detail: 'Staging test account signed in' }],
  }
}

export async function checkProtectedPreviewAccess({
  fetchImpl = globalThis.fetch,
  deploymentUrl,
  accessToken = '',
  expectAdmin = false,
} = {}) {
  let parsed
  try {
    parsed = new URL(deploymentUrl)
  } catch {
    return { ok: false, checks: [{ id: 'protected-route', status: 'FAIL', detail: 'Preview URL is invalid' }] }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, checks: [{ id: 'protected-route', status: 'FAIL', detail: 'Preview URL must use HTTPS' }] }
  }
  let response
  try {
    response = await fetchImpl(new URL(PROTECTED_PATH, parsed), {
      method: 'GET',
      redirect: 'manual',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
  } catch {
    return { ok: false, checks: [{ id: 'protected-route', status: 'FAIL', detail: 'Protected route is unavailable' }] }
  }
  const body = await readJson(response)
  const code = body?.error?.code || body?.code || ''
  const checks = []
  if (!accessToken) {
    const blocked = response.status === 401 || response.status === 403
    add(checks, 'unauthorized-blocked', blocked, blocked ? 'Protected route rejects an anonymous caller' : 'Protected route accepted an anonymous caller')
    return { ok: checks.every((check) => check.status === 'PASS'), checks }
  }
  if (response.status >= 500 || response.status === 0) {
    add(checks, 'authenticated-protected', false, 'Protected route is unavailable')
    return { ok: false, checks }
  }
  const authenticated = response.status !== 401 && code !== 'AUTH_REQUIRED'
  add(checks, 'authenticated-protected', authenticated, authenticated ? 'Authenticated caller reached the protected route' : 'Authenticated caller was treated as anonymous')
  if (!authenticated) return { ok: false, checks }
  const isAdmin = response.status === 200 && body?.ok === true && body?.session?.authorized === true
  if (expectAdmin) {
    add(checks, 'billing-admin', isAdmin, isAdmin ? 'Billing admin capability was verified by the server' : 'Authenticated account does not have billing admin')
  } else {
    add(checks, 'test-user-not-admin', !isAdmin && response.status === 403, !isAdmin && response.status === 403 ? 'Staging test account is not a billing admin' : 'Staging test account must not have billing admin')
  }
  return { ok: checks.every((check) => check.status === 'PASS'), checks }
}

export function formatPreviewAuthChecks(checks) {
  return checks.map((check) => `${check.status} ${check.id}: ${check.detail}`).join('\n')
}

export function runPreviewAuthPreflight(env = process.env) {
  const result = checkPreviewAuthEnvironment(env)
  console.log(formatPreviewAuthChecks(result.checks))
  console.log(result.ok ? 'PREVIEW AUTH CONFIG PASS' : 'PREVIEW AUTH CONFIG FAIL — do not run login tests')
  return result.ok ? 0 : 1
}

export async function runPreviewAuthDeploymentPreflight({
  deploymentUrl,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = checkPreviewAuthEnvironment(env)
  const checks = [...config.checks]
  if (!config.ok) {
    console.log(formatPreviewAuthChecks(checks))
    console.log('PREVIEW AUTH CONFIG FAIL — login was not attempted')
    return 1
  }
  const health = await checkAuthServiceReachable({ fetchImpl, supabaseUrl: env.SUPABASE_URL })
  checks.push(...health.checks)
  let indexText = ''
  try {
    const index = await fetchImpl(deploymentUrl, { method: 'GET', redirect: 'manual' })
    indexText = await index.text()
  } catch {
    checks.push({ id: 'preview-bundle', status: 'FAIL', detail: 'Preview deployment could not be read' })
  }
  if (/log in to vercel/i.test(indexText)) {
    checks.push({ id: 'preview-bundle', status: 'FAIL', detail: 'Preview is behind Vercel Authentication and was not read' })
  } else if (indexText) {
    const paths = extractPreviewAssetPaths(indexText)
    const texts = [indexText]
    for (const path of paths) {
      try {
        const asset = await fetchImpl(new URL(path, deploymentUrl), { method: 'GET', redirect: 'manual' })
        texts.push(await asset.text())
      } catch {
        checks.push({ id: 'preview-bundle', status: 'FAIL', detail: 'A Preview asset could not be read' })
      }
    }
    if (paths.length === 0) {
      checks.push({ id: 'preview-bundle', status: 'FAIL', detail: 'Preview did not expose a client bundle' })
    }
    checks.push(...inspectPreviewClientBundle(texts).checks)
  }
  const bundleFailed = checks.some((check) => check.id.startsWith('client-bundle') && check.status === 'FAIL' || check.id === 'preview-bundle' && check.status === 'FAIL' || check.id === 'client-secrets-hidden' && check.status === 'FAIL')
  if (bundleFailed || !health.ok) {
    console.log(formatPreviewAuthChecks(checks))
    console.log('PREVIEW AUTH DEPLOYMENT FAIL — login was not attempted')
    return 1
  }
  const login = await checkStagingTestLogin({
    fetchImpl,
    supabaseUrl: env.SUPABASE_URL,
    anonKey: env.VITE_SUPABASE_ANON_KEY,
    email: env.PREVIEW_AUTH_TEST_EMAIL,
    password: env.PREVIEW_AUTH_TEST_PASSWORD,
  })
  checks.push(...login.checks)
  const anonymous = await checkProtectedPreviewAccess({ fetchImpl, deploymentUrl })
  checks.push(...anonymous.checks)
  if (login.ok) {
    const userAccess = await checkProtectedPreviewAccess({ fetchImpl, deploymentUrl, accessToken: login.accessToken })
    checks.push(...userAccess.checks)
  }
  if (present(env.PREVIEW_AUTH_ADMIN_EMAIL) && present(env.PREVIEW_AUTH_ADMIN_PASSWORD)) {
    const adminLogin = await checkStagingTestLogin({
      fetchImpl,
      supabaseUrl: env.SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_ANON_KEY,
      email: env.PREVIEW_AUTH_ADMIN_EMAIL,
      password: env.PREVIEW_AUTH_ADMIN_PASSWORD,
    })
    if (!adminLogin.ok) {
      checks.push({ id: 'billing-admin', status: 'FAIL', detail: 'Billing admin account authentication failed' })
    } else {
      const adminAccess = await checkProtectedPreviewAccess({
        fetchImpl,
        deploymentUrl,
        accessToken: adminLogin.accessToken,
        expectAdmin: true,
      })
      checks.push(...adminAccess.checks.filter((check) => check.id === 'billing-admin' || check.id === 'authenticated-protected'))
    }
  } else {
    checks.push({ id: 'billing-admin', status: 'FAIL', detail: 'Dedicated billing admin account is not configured' })
  }
  const ok = checks.every((check) => check.status === 'PASS')
  console.log(formatPreviewAuthChecks(checks))
  console.log(ok ? 'PREVIEW AUTH DEPLOYMENT PASS' : 'PREVIEW AUTH DEPLOYMENT FAIL')
  return ok ? 0 : 1
}
