import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wardrobeIsolationFixtures as fixtures } from './wardrobeIsolationFixtures.mjs'

const canary = 'synthetic_inherited_server_canary_do_not_emit'
const inherited = { VITE_SUPABASE_URL: 'https://bxmdlckrlwzdtcxnsqqr.supabase.co', VITE_SUPABASE_ANON_KEY: 'synthetic-inherited-public-canary', SUPABASE_SERVICE_ROLE_KEY: canary, OPENAI_API_KEY: canary, RESEND_API_KEY: canary }
function build(env, mode = 'production') {
  return spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', mode, '--outDir', '.tmp/wardrobe-offline-dist'], { env: { ...process.env, ...inherited, ...env }, encoding: 'utf8' })
}
const negatives = [
  ['missing-provider-environment', { ...fixtures, VERCEL_ENV: '' }],
  ['missing-provider-branch', { ...fixtures, VERCEL_GIT_COMMIT_REF: '' }],
  ['missing-dedicated-branch', { ...fixtures, WARDROBE_STAGING_BRANCH: '' }],
  ['wrong-project', { ...fixtures, WARDROBE_STAGING_SUPABASE_URL: inherited.VITE_SUPABASE_URL }],
  ['AI-enabled', { ...fixtures, WARDROBE_STAGING_AI_DISABLED: 'false' }],
  ['public-server-secret', { ...fixtures, VITE_UNEXPECTED_VALUE: fixtures.WARDROBE_STAGING_SERVICE_ROLE_KEY }],
]
for (const [name, env] of negatives) {
  const result = build(env, 'test') // --mode test must not bypass a real build gate.
  if (result.status === 0) throw Error(`negative_build_unexpectedly_passed:${name}`)
  if (!(result.stderr || '').includes('wardrobe_') && !(result.stderr || '').includes('public_server_credential_blocked')) throw Error(`negative_build_failed_for_unexpected_reason:${name}`)
  console.log(`PASS build rejects ${name}`)
}
const valid = build(fixtures)
if (valid.status !== 0) throw Error('offline_fixture_build_failed')
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]) }
const textFiles = files('.tmp/wardrobe-offline-dist').filter((path) => /\.(js|css|html|json|webmanifest)$/.test(path))
const forbidden = [canary, fixtures.WARDROBE_STAGING_SERVICE_ROLE_KEY, inherited.VITE_SUPABASE_ANON_KEY, 'bxmdlckrlwzdtcxnsqqr']
for (const file of textFiles) {
  const text = readFileSync(file, 'utf8')
  if (forbidden.some((value) => text.includes(value))) throw Error('offline_bundle_contains_forbidden_configuration')
}
const html = readFileSync('.tmp/wardrobe-offline-dist/index.html', 'utf8')
if (!html.includes('Content-Security-Policy') || !html.includes('connect-src &#39;self&#39;')) throw Error('offline_browser_policy_missing')
console.log(`PASS offline build and ${textFiles.length} public text files: no inherited Production configuration or server canaries`)
