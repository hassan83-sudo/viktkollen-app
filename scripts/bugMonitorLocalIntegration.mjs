import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import handler from '../api/_shared/bugMonitor/httpHandler.js'
import { setBugMonitorAdminLookupForTests } from '../api/_shared/bugMonitor/httpHandler.js'
import { setSupabaseAuthVerifierForTests } from '../api/_shared/verifySupabaseUser.js'
import { setBugMonitorStoreForTests } from '../src/services/bugMonitor/bugMonitorStore.js'

const PRODUCTION_REF = 'bxmdlckrlwzdtcxnsqqr'
const results = []

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function redact(value) {
  return String(value || '')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(new RegExp(PRODUCTION_REF, 'g'), '[production-ref]')
}

function localStatus() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    shell: true,
  })
  const start = output.indexOf('{')
  const status = JSON.parse(output.slice(start))
  const apiUrl = String(status.API_URL || '')
  const dbUrl = String(status.DB_URL || '')
  const host = new URL(apiUrl).hostname
  const dbHost = new URL(dbUrl.replace(/^postgres(ql)?:/, 'http:')).hostname
  const serialized = JSON.stringify(status)
  if (serialized.includes(PRODUCTION_REF)) {
    throw new Error('Refusing production project bxmdlckrlwzdtcxnsqqr')
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing non-local API host ${host}`)
  }
  if (dbHost !== '127.0.0.1' && dbHost !== 'localhost') {
    throw new Error(`Refusing non-local database host ${dbHost}`)
  }
  if (/supabase\.co/i.test(serialized)) {
    throw new Error('Refusing hosted Supabase URL')
  }
  return {
    anonKey: status.ANON_KEY,
    apiUrl,
    dbUrl,
    host,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  }
}

function createResponse() {
  return {
    headers: {},
    payload: null,
    statusCode: 200,
    json(payload) {
      this.payload = payload
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
  }
}

async function callApi({ body, method = 'POST', token = '' } = {}) {
  const response = createResponse()
  await handler({
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method,
  }, response)
  return response
}

function psql(sql) {
  try {
    const stdout = execFileSync('docker', [
      'exec', '-i', 'supabase_db_viktkollen-bug-monitor-local',
      'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql,
    ], { encoding: 'utf8' })
    return { ok: true, stdout: stdout.trim() }
  } catch (error) {
    return { ok: false, stdout: redact(error.stdout), stderr: redact(error.stderr) }
  }
}

async function signup(status, email) {
  const response = await fetch(`${status.apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${status.anonKey}`,
      apikey: status.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: `Local-${Date.now()}-Bug` }),
  })
  const payload = await response.json()
  const token = payload.access_token || payload.session?.access_token || ''
  const userId = payload.user?.id || payload.id || ''
  if (!response.ok || !token || !userId) {
    throw new Error(`signup failed ${response.status} ${redact(payload.msg || payload.error_description || payload.message || '')}`)
  }
  return { token, userId }
}

function reportBody(extra = {}) {
  return {
    appVersion: '1.0.0',
    chat: 'hemlig chatt',
    email: 'person@example.com',
    errorType: 'render',
    feature: 'app',
    fingerprint: 'render-local',
    image: 'data:image/png;base64,aaaa',
    password: 'hunter2',
    severity: 'high',
    token: 'sekret-token',
    ...extra,
  }
}

const status = localStatus()
process.env.SUPABASE_URL = status.apiUrl
process.env.SUPABASE_ANON_KEY = status.anonKey
process.env.SUPABASE_SERVICE_ROLE_KEY = status.serviceRoleKey
delete process.env.VITE_SUPABASE_URL
setBugMonitorAdminLookupForTests(null)
setSupabaseAuthVerifierForTests(null)
setBugMonitorStoreForTests(undefined)

record('database host is local', status.host === '127.0.0.1' || status.host === 'localhost', status.host)
record('database is not production', !status.apiUrl.includes(PRODUCTION_REF) && !status.dbUrl.includes(PRODUCTION_REF))

const cleared = psql('truncate table bug_monitor.reports, bug_monitor.acknowledgements')
record('local report tables reset', cleared.ok, cleared.ok ? '' : cleared.stderr)

const columns = psql("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'bug_monitor' and table_name = 'reports'")
const forbiddenColumn = /\b(authorization|chat|email|image|message|password|token)\b/i.test(columns.stdout)
record('report columns exclude sensitive fields', columns.ok && !forbiddenColumn, columns.stdout)

const anonRead = psql('begin; set local role anon; select count(*) from bug_monitor.reports; rollback;')
record('anon cannot read reports', !anonRead.ok && /permission denied/i.test(`${anonRead.stderr} ${anonRead.stdout}`))

const authExecute = psql('begin; set local role authenticated; select bug_monitor.summary(); rollback;')
record('authenticated cannot execute summary', !authExecute.ok && /permission denied/i.test(`${authExecute.stderr} ${authExecute.stdout}`))

const serviceRead = psql('begin; set local role service_role; select count(*) from bug_monitor.reports; rollback;')
record('service role cannot read report rows', !serviceRead.ok && /permission denied/i.test(`${serviceRead.stderr} ${serviceRead.stdout}`))

const serviceSummary = psql('begin; set local role service_role; select bug_monitor.summary(); rollback;')
record('service role can execute summary', serviceSummary.ok && serviceSummary.stdout.includes('affectedCount'))

const anonClient = createClient(status.apiUrl, status.anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
const anonRpc = await anonClient.schema('bug_monitor').rpc('summary')
record('PostgREST anon cannot call summary', Boolean(anonRpc.error))

const unsigned = await callApi({ body: reportBody() })
record('unsigned report is rejected', unsigned.statusCode === 401 && !JSON.stringify(unsigned.payload).includes('hunter2'))

const stamp = Date.now()
const admin = await signup(status, `bug-admin-${stamp}@example.com`)
const member = await signup(status, `bug-member-${stamp}@example.com`)
const spam = await signup(status, `bug-spam-${stamp}@example.com`)
const grant = psql(`insert into billing.admin_permissions (user_id, permission, status) values ('${admin.userId}', 'billing_admin', 'ACTIVE')`)
record('local admin fixture row inserted', grant.ok, grant.ok ? '' : grant.stderr)

const memberOverview = await callApi({ method: 'GET', token: member.token })
record('signed-in non-admin cannot read the monitor', memberOverview.statusCode === 403)

const first = await callApi({ body: reportBody(), token: member.token })
record('signed-in report is stored', first.statusCode === 202 && first.payload?.stored === true)

const duplicate = await callApi({ body: reportBody(), token: member.token })
record('same actor and fingerprint is deduped for 60 seconds', duplicate.statusCode === 202 && duplicate.payload?.stored === false)

const second = await callApi({
  body: reportBody({ fingerprint: 'render-local' }),
  token: admin.token,
})
record('second actor is stored', second.statusCode === 202 && second.payload?.stored === true)

const chunk = await callApi({
  body: reportBody({ errorType: 'chunkLoad', fingerprint: 'chunkLoad-local', severity: 'high' }),
  token: member.token,
})
record('chunkLoad fingerprint is accepted', chunk.statusCode === 202 && chunk.payload?.stored === true)

const adminOverview = await callApi({ method: 'GET', token: admin.token })
const summary = adminOverview.payload?.summary
const renderGroup = summary?.groups?.find((group) => group.fingerprint === 'render-local')
const leaked = JSON.stringify(summary || {}).match(/hunter2|person@example.com|hemlig chatt|sekret-token|data:image|actor_key/i)
record(
  'admin overview groups two actors once',
  adminOverview.statusCode === 200 && summary?.affectedCount === 2 && renderGroup?.affectedCount === 2 && renderGroup?.status === 'recurring' && renderGroup?.count === 2,
  `http=${adminOverview.statusCode} affected=${summary?.affectedCount} groupAffected=${renderGroup?.affectedCount} count=${renderGroup?.count} status=${renderGroup?.status || ''}`,
)
record('overview hides sensitive fields and actor keys', !leaked)

let storedSpam = 0
let limited = false
for (let index = 1; index <= 31; index += 1) {
  const response = await callApi({
    body: reportBody({ fingerprint: `render-spam${String(index).padStart(2, '0')}` }),
    token: spam.token,
  })
  if (response.payload?.stored === true) storedSpam += 1
  if (response.statusCode === 429) limited = true
}
record('hourly cap stores 30 and rejects the next', storedSpam === 30 && limited, `stored=${storedSpam} limited=${limited}`)

const serviceClient = createClient(status.apiUrl, status.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const ackRpc = await serviceClient.schema('bug_monitor').rpc('acknowledge_report', { p_fingerprint: 'render-local' })
record('PostgREST acknowledge returns true', ackRpc.data === true, `type=${typeof ackRpc.data} error=${ackRpc.error?.code || ''}`)

const acknowledged = await callApi({
  body: { action: 'acknowledge', fingerprint: 'render-local' },
  method: 'POST',
  token: admin.token,
})
const acknowledgedGroup = acknowledged.payload?.summary?.groups?.find((group) => group.fingerprint === 'render-local')
record('admin can acknowledge a group', acknowledged.statusCode === 200 && acknowledgedGroup?.status === 'acknowledged', `status=${acknowledged.statusCode} group=${acknowledgedGroup?.status || ''} code=${acknowledged.payload?.error?.code || ''}`)

const memberAck = await callApi({
  body: { action: 'acknowledge', fingerprint: 'chunkLoad-local' },
  method: 'POST',
  token: member.token,
})
record('non-admin cannot acknowledge', memberAck.statusCode === 403)

const plan = await callApi({
  body: { action: 'plan', fingerprint: 'render-local' },
  method: 'POST',
  token: admin.token,
})
record('plan does not merge, deploy, or change the database', plan.statusCode === 200 && plan.payload?.plan?.automatic?.merge === false && plan.payload?.plan?.automatic?.productionDeploy === false && plan.payload?.plan?.automatic?.databaseChange === false)

const row = psql("select string_agg(actor_key || ' ' || fingerprint, ',') from bug_monitor.reports")
record('stored rows contain no sensitive payload', row.ok && !/hunter2|person@example.com|hemlig|sekret-token|data:image/i.test(row.stdout))

const failed = results.filter((item) => !item.ok)
console.log(`RESULT ${results.length - failed.length}/${results.length}`)
if (failed.length > 0) process.exitCode = 1
