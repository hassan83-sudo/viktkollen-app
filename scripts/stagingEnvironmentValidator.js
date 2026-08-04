import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const placeholderPattern = /^(|changeme|change-me|placeholder|todo|example|your-|xxx|test)$/i
const requiredClientVariables = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
const serverOnlyVariables = ['OPENAI_API_KEY']
const requiredRoutes = ['api/nutrition-photo-analysis/index.js', 'api/adaptive-coach/index.js']
const requiredPublicFiles = [
  'public/manifest.webmanifest',
  'public/sw.js',
  'public/pwa-icon-192.png',
  'public/pwa-icon-512.png',
  'public/pwa-maskable-512.png',
]

function envValue(env, name) {
  return typeof env[name] === 'string' ? env[name].trim() : ''
}

function parseEnvText(text = '') {
  return String(text)
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return env
      const [rawName, ...rawValue] = trimmed.split('=')
      const name = rawName.trim()
      const value = rawValue.join('=').trim().replace(/^["']|["']$/g, '')
      return name ? { ...env, [name]: value } : env
    }, {})
}

function loadLocalEnv(cwd, files) {
  return ['.env', '.env.local'].reduce((env, file) => {
    if (!files.exists(file)) return env
    return {
      ...env,
      ...parseEnvText(files.read(file)),
    }
  }, {})
}

function isPlaceholder(value) {
  return placeholderPattern.test(String(value || '').trim())
}

function isValidUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

function makeCheck(id, status, message, blocking = status === 'FAIL') {
  return { blocking, id, message, status }
}

export function validateStagingEnvironment({
  cwd = process.cwd(),
  env = process.env,
  files = {
    exists: (path) => existsSync(resolve(cwd, path)),
    read: (path) => readFileSync(resolve(cwd, path), 'utf8'),
  },
} = {}) {
  const checks = []

  requiredClientVariables.forEach((name) => {
    const value = envValue(env, name)
    if (!value) {
      checks.push(makeCheck(name, 'FAIL', `${name} saknas.`))
      return
    }
    if (isPlaceholder(value)) {
      checks.push(makeCheck(name, 'FAIL', `${name} verkar vara ett placeholdervärde.`))
      return
    }
    if (name.endsWith('_URL') && !isValidUrl(value)) {
      checks.push(makeCheck(name, 'FAIL', `${name} har ogiltigt URL-format.`))
      return
    }
    checks.push(makeCheck(name, 'PASS', `${name} är konfigurerad.`, false))
  })

  serverOnlyVariables.forEach((name) => {
    const value = envValue(env, name)
    const viteName = `VITE_${name}`
    if (envValue(env, viteName)) {
      checks.push(makeCheck(viteName, 'FAIL', `${viteName} får inte exponera servernycklar i klienten.`))
      return
    }
    if (!value) {
      checks.push(makeCheck(name, 'SKIP', `${name} saknas. Photo route kan inte köras mot riktig provider.`, false))
      return
    }
    if (isPlaceholder(value)) {
      checks.push(makeCheck(name, 'FAIL', `${name} verkar vara ett placeholdervärde.`))
      return
    }
    checks.push(makeCheck(name, 'PASS', `${name} är konfigurerad server-side.`, false))
  })

  requiredRoutes.forEach((file) => {
    checks.push(files.exists(file)
      ? makeCheck(file, 'PASS', `${file} finns.`, false)
      : makeCheck(file, 'FAIL', `${file} saknas.`))
  })

  requiredPublicFiles.forEach((file) => {
    checks.push(files.exists(file)
      ? makeCheck(file, 'PASS', `${file} finns.`, false)
      : makeCheck(file, 'FAIL', `${file} saknas.`))
  })

  const vercelJsonExists = files.exists('vercel.json')
  checks.push(makeCheck('vercel.json', vercelJsonExists ? 'PASS' : 'SKIP', vercelJsonExists
    ? 'vercel.json finns.'
    : 'vercel.json saknas. Vercel defaults används eller verifieras i dashboard.', false))

  if (files.exists('.env.example')) {
    const example = files.read('.env.example')
    const exposedServerSecret = serverOnlyVariables.some((name) =>
      new RegExp(`^VITE_${name}=`, 'm').test(example))
    checks.push(exposedServerSecret
      ? makeCheck('.env.example', 'FAIL', '.env.example exponerar server-only variabel med VITE_.')
      : makeCheck('.env.example', 'PASS', '.env.example exponerar inte server-only nycklar som VITE_.', false))
  }

  return {
    checks,
    ok: checks.every((check) => !(check.status === 'FAIL' && check.blocking)),
    summary: {
      fail: checks.filter((check) => check.status === 'FAIL').length,
      pass: checks.filter((check) => check.status === 'PASS').length,
      skip: checks.filter((check) => check.status === 'SKIP').length,
    },
  }
}

export function formatStagingValidation(result) {
  return result.checks
    .map((check) => `${check.status} ${check.id} - ${check.message}`)
    .join('\n')
}

export function runStagingValidationCli(options = {}) {
  const cwd = options.cwd || process.cwd()
  const files = options.files || {
    exists: (path) => existsSync(resolve(cwd, path)),
    read: (path) => readFileSync(resolve(cwd, path), 'utf8'),
  }
  const result = validateStagingEnvironment({
    ...options,
    cwd,
    env: {
      ...loadLocalEnv(cwd, files),
      ...process.env,
      ...(options.env || {}),
    },
    files,
  })
  console.log(formatStagingValidation(result))
  console.log(`SUMMARY PASS=${result.summary.pass} FAIL=${result.summary.fail} SKIP=${result.summary.skip}`)
  return result.ok ? 0 : 1
}

export const stagingEnvironmentValidatorInternals = {
  parseEnvText,
}
