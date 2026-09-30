import { Buffer } from 'node:buffer'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { defineConfig } from '@playwright/test'

// Isolated AI Help test server. Vite does not apply vercel.json rewrites, so
// this process mounts the shared handlers on the public /api/ai-help and
// /api/ai-coach paths. The shared Vite config is not changed.
const port = 5176

function withVercelResponseHelpers(response) {
  if (typeof response.status !== 'function') {
    response.status = (statusCode) => {
      response.statusCode = statusCode
      return response
    }
  }
  if (typeof response.json !== 'function') {
    response.json = (payload) => {
      if (!response.headersSent) response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify(payload))
      return response
    }
  }
  return response
}

async function readDevRequestBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function aiHelpTestApiPlugin() {
  return {
    apply: 'serve',
    configureServer(server) {
      const mount = (path, moduleUrl) => {
        server.middlewares.use(path, async (request, response) => {
          try {
            request.body = await readDevRequestBody(request)
            const route = await import(moduleUrl)
            await route.default(request, withVercelResponseHelpers(response))
          } catch {
            if (!response.headersSent) {
              response.statusCode = 500
              response.setHeader('Content-Type', 'application/json; charset=utf-8')
            }
            response.end(JSON.stringify({
              error: { code: 'DEV_API_ROUTE_FAILED', retryable: true },
              ok: false,
            }))
          }
        })
      }
      mount('/api/ai-help', './api/_shared/aiHelp/httpHandler.js')
      mount('/api/ai-coach', './api/_shared/aiCoach/httpHandler.js')
    },
    name: 'ai-help-test-api',
  }
}

async function startAiHelpTestServer() {
  const server = await createServer({
    configFile: fileURLToPath(new URL('./vite.config.js', import.meta.url)),
    plugins: [aiHelpTestApiPlugin()],
    server: { host: '127.0.0.1', port, strictPort: true },
  })
  await server.listen()
  await new Promise(() => {})
}

function readNamedEnvValue(filePath, name) {
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    if (trimmed.slice(0, index).trim() !== name) continue
    return trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

async function applyStagingAuthEnv() {
  const file = process.env.AI_HELP_STAGING_ENV_FILE
  if (!file) throw new Error('staging_env_file_missing')
  const { loadBillingTestEnvFile } = await import('./src/services/billing/stagingLive.js')
  const { stagingAuthTargetFromEnv } = await import('./src/features/aiHelp/stagingAuthTarget.js')
  const target = stagingAuthTargetFromEnv(loadBillingTestEnvFile(file, {}))
  Object.assign(process.env, target.clientEnv)
}

async function applySharedCostEnv() {
  const file = process.env.AI_HELP_STAGING_ENV_FILE
  if (!file) throw new Error('staging_env_file_missing')
  const { assertStagingDatabaseUrl, loadBillingTestEnvFile } = await import('./src/services/billing/stagingLive.js')
  const env = loadBillingTestEnvFile(file, {})
  const gate = assertStagingDatabaseUrl(env)
  if (gate.validation?.target !== 'staging' || gate.databaseRef !== gate.stagingRef || gate.databaseRef === gate.productionRef) {
    throw new Error('cost_target_rejected')
  }
  const url = String(env.BILLING_TEST_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const serviceRoleKey = String(env.BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url.startsWith('https://') || !serviceRoleKey || url.includes(serviceRoleKey)) {
    throw new Error('cost_credentials_rejected')
  }
  for (const name of Object.keys(process.env)) {
    if (/^VITE_.*SERVICE_ROLE/i.test(name)) delete process.env[name]
  }
  process.env.AI_HELP_COST_SUPABASE_URL = url
  process.env.AI_HELP_COST_SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
  process.env.AI_HELP_BUDGET_SEK = '10'
  process.env.AI_HELP_BUDGET_PERIOD_SECONDS = '2592000'
}

function applyServerOpenAiKey() {
  const file = process.env.AI_HELP_OPENAI_ENV_FILE
  if (!file) throw new Error('openai_env_file_missing')
  const value = readNamedEnvValue(file, 'OPENAI_API_KEY')
  if (!value) throw new Error('openai_key_missing')
  delete process.env.VITE_OPENAI_API_KEY
  process.env.OPENAI_API_KEY = value
}

function installUsageCapture() {
  const file = process.env.AI_HELP_USAGE_FILE || join(tmpdir(), 'viktkollen-ai-help-live-usage.json')
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input, init) => {
    const response = await original(input, init)
    const url = typeof input === 'string' ? input : input?.url || ''
    if (!url.includes('api.openai.com/v1/responses')) return response
    calls += 1
    let payload
    try {
      payload = await response.clone().json()
    } catch {
      payload = null
    }
    const usage = payload?.usage || {}
    writeFileSync(file, JSON.stringify({
      calls,
      incomplete: payload?.status === 'incomplete' || payload?.incomplete_details?.reason === 'max_output_tokens',
      incompleteReason: payload?.incomplete_details?.reason || '',
      inputTokens: usage.input_tokens ?? null,
      model: payload?.model || '',
      openaiStatus: response.status,
      outputTokens: usage.output_tokens ?? null,
      reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? null,
    }))
    return response
  }
}

if (process.argv.includes('--serve-staging')) {
  await applyStagingAuthEnv()
  await applySharedCostEnv()
  applyServerOpenAiKey()
  if (process.env.AI_HELP_USAGE_CAPTURE === '1') installUsageCapture()
  await startAiHelpTestServer()
} else if (process.argv.includes('--serve')) {
  await startAiHelpTestServer()
}

export default defineConfig({
  expect: { timeout: 8000 },
  fullyParallel: false,
  reporter: [['list']],
  retries: 0,
  testDir: './tests/ai-help',
  testMatch: '**/*.spec.js',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: true,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'node playwright.ai-help.config.js --serve',
    env: {
      VITE_SUPABASE_ANON_KEY: 'local-ai-help-check',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    },
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 60000,
    url: `https://127.0.0.1:${port}`,
  },
})
