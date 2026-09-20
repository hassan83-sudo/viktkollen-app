import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const clientFiles = [
  'src/features/ai-ear/AiEarMode.jsx',
  'src/features/ai-ear/aiEarViewModel.js',
  'src/services/aiEarAudio.js',
  'src/services/aiEarInterpret.js',
  'src/services/aiEarProviders.js',
]
const serverFiles = [
  'api/_shared/aiEarProviderRoute.js',
  'api/ai-ear-music-recognition/index.js',
  'api/ai-ear-humming-recognition/index.js',
  'api/ai-ear-lyrics-transcription/index.js',
  'api/ai-ear-providers/index.js',
]

describe('Sprint 12A provider secrets stay on the server', () => {
  it('client code never references provider credentials, hosts or server env', () => {
    clientFiles.forEach((file) => {
      const source = stripComments(read(file))
      expect(source, file).not.toMatch(/AUDD_API_TOKEN|ACRCLOUD_|OPENAI_API_KEY|api\.audd\.io|api\.openai\.com|acrcloud\.com|process\.env|import\.meta\.env|VITE_/)
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB/)
      expect(source, file).not.toMatch(/console\.(log|info|warn|error|debug)/)
    })
  })

  it('client only talks to Viktkollen endpoints', () => {
    const urls = [...stripComments(read('src/services/aiEarProviders.js')).matchAll(/['"`](\/api\/[a-z0-9-/]+|https?:\/\/[^'"`]+)['"`]/g)].map((match) => match[1])
    expect(urls.length).toBeGreaterThan(0)
    urls.forEach((url) => expect(url.startsWith('/api/ai-ear'), url).toBe(true))
  })

  it('server routes never log secrets, signatures, audio, bodies or transcript text', () => {
    serverFiles.forEach((file) => {
      const source = stripComments(read(file))
      const logCalls = source.match(/console\.(log|info|warn|error)\([^)]*\)/g) || []
      logCalls.forEach((call) => {
        expect(call, `${file}: ${call}`).not.toMatch(/apiToken|accessKey|accessSecret|signature|authorization|apiKey|transcript(?!Length)|payload|\.data\b|audio\.data|text\b/i)
      })
      expect(source, file).not.toMatch(/VITE_|NEXT_PUBLIC_/)
      expect(source, file).not.toMatch(/from 'node:fs'|writeFile|createWriteStream|tmpdir/)
    })
  })

  it('each provider route talks only to its own provider', () => {
    expect(stripComments(read('api/ai-ear-music-recognition/index.js'))).not.toMatch(/acrcloud|openai\.com|perch|v2\/interpret/i)
    expect(stripComments(read('api/ai-ear-humming-recognition/index.js'))).not.toMatch(/audd\.io|openai\.com|perch|v2\/interpret/i)
    expect(stripComments(read('api/ai-ear-lyrics-transcription/index.js'))).not.toMatch(/audd\.io|acrcloud\.com|perch|v2\/interpret/i)
  })

  it('.env.example documents only names for the new server-only variables', () => {
    const env = read('.env.example')
    for (const name of ['AUDD_API_TOKEN', 'ACRCLOUD_HOST', 'ACRCLOUD_ACCESS_KEY', 'ACRCLOUD_ACCESS_SECRET']) {
      expect(env, name).toMatch(new RegExp(`^${name}=$`, 'm'))
    }
    expect(env).not.toMatch(/VITE_(AUDD|ACRCLOUD)/)
  })

  it('the frozen Perch/YAMNet route is untouched by name and still the only Cloud Run caller', () => {
    expect(read('api/ai-ear/interpret/index.js')).toContain('/v2/interpret')
    serverFiles.filter((file) => file !== 'api/_shared/aiEarProviderRoute.js').forEach((file) => expect(read(file), file).not.toContain('getGoogleIdToken'))
  })
})
