import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

import { getFeatureFlags, isFeatureEnabled } from '../featureRegistry.js'
import { getSmartCameraHubModes } from '../smart-camera/smartCameraModes.js'

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const clientFiles = [
  'src/features/ai-ear/AiEarMode.jsx',
  'src/features/ai-ear/aiEarViewModel.js',
  'src/services/aiEarAudio.js',
  'src/services/aiEarInterpret.js',
]

describe('AI-örat feature flag', () => {
  it('is ON by default (client) and shown in the Smart kamera hub; the server switch AI_EAR_ENABLED is the real gate', () => {
    const flags = getFeatureFlags()
    expect(isFeatureEnabled('aiEar', flags)).toBe(true)
    const { primary } = getSmartCameraHubModes(flags)
    expect(primary.some((mode) => mode.id === 'ai-ear')).toBe(true)
  })

  it('can be switched off per browser and then does not change other modes', () => {
    const on = getSmartCameraHubModes(getFeatureFlags())
    const off = getSmartCameraHubModes(getFeatureFlags({ aiEar: false }))
    expect([...off.primary, ...off.secondary].some((mode) => mode.id === 'ai-ear')).toBe(false)
    expect(on.primary.filter((mode) => mode.id !== 'ai-ear')).toEqual(off.primary)
    expect(on.secondary).toEqual(off.secondary)
  })
})

describe('AI-örat client secret hygiene', () => {
  it('contains no Google credentials, private keys or VITE_ env access in client code', () => {
    clientFiles.forEach((file) => {
      const source = stripComments(read(file))
      expect(source, file).not.toMatch(/PRIVATE KEY|private_key|client_email|service.?account|oauth2\.googleapis|run\.app|\.iam\./i)
      expect(source, file).not.toMatch(/import\.meta\.env|VITE_/)
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB/)
      expect(source, file).not.toMatch(/console\.(log|info|warn|error|debug)/)
    })
  })

  it('never reads a Google token or calls Cloud Run from the browser', () => {
    clientFiles.forEach((file) => {
      const source = stripComments(read(file))
      expect(source, file).not.toMatch(/process.env|AI_EAR_(BACKEND|ENABLED|GCP)|GOOGLE|identity.?token|id_token/i)
    })
    expect(read('src/services/aiEarInterpret.js')).toContain("'/api/ai-ear/interpret'")
  })

  it('server hop code never logs Authorization, tokens, audio or file names', () => {
    const source = stripComments(read('api/ai-ear/interpret/index.js') + read('api/_shared/googleIdToken.js'))
    const logCalls = source.match(/console\.(log|info|warn|error)\([^)]*\)/g) || []
    logCalls.forEach((call) => {
      expect(call).not.toMatch(/authorization|idToken|assertion|privateKey|payload|fileName|\baudio\s*[,)]|audio\.(buffer|slice|toString)/i)
    })
    expect(source).not.toMatch(/VITE_/)
  })

  it('.env.example documents only server-only placeholders (no secrets)', () => {
    const env = read('.env.example')
    expect(env).toContain('AI_EAR_ENABLED=false')
    expect(env).toContain('AI_EAR_GCP_SERVICE_ACCOUNT_JSON=')
    expect(env).not.toMatch(/VITE_AI_EAR/)
    expect(env).not.toMatch(/AI_EAR_GCP_SERVICE_ACCOUNT_JSON=.{5,}/)
  })
})
