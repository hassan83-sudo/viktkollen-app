import { readFileSync } from 'node:fs'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

import { loadServerOnlyDevEnv } from '../vite.config.js'

describe('vite dev nutrition photo route middleware', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('keeps Cloudflare tunnel hosts scoped and avoids allowing every host', () => {
    const source = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

    expect(source).toContain("allowedHosts: ['.trycloudflare.com']")
    expect(source).not.toMatch(/allowedHosts:\s*true/)
  })

  it('passes the original request through so Authorization reaches the API route', () => {
    const source = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
    const middleware = source.slice(
      source.indexOf("server.middlewares.use('/api/nutrition-photo-analysis'"),
      source.indexOf("name: 'viktkollen-nutrition-photo-api-dev-middleware'"),
    )

    expect(middleware).toContain('authPresent: Boolean(request.headers.authorization)')
    expect(middleware).toContain('await route.default(request, withVercelResponseHelpers(response))')
    expect(middleware).not.toContain('new Request')
    expect(middleware).not.toContain('fetch(')
  })

  it('loads server-only OpenAI env before the dev API handler needs provider config', () => {
    process.env.OPENAI_API_KEY = ''
    process.env.OPENAI_MODEL = ''
    delete process.env.VITE_OPENAI_API_KEY

    const status = loadServerOnlyDevEnv('development', () => ({
      OPENAI_API_KEY: 'test-server-key',
      OPENAI_MODEL: 'test-model',
      VITE_OPENAI_API_KEY: 'must-not-be-used',
    }))

    expect(status).toMatchObject({
      modelConfigured: true,
      openAiKeyPresent: true,
      providerConfigured: true,
      providerName: 'openai',
    })
    expect(process.env.OPENAI_API_KEY).toBe('test-server-key')
    expect(process.env.OPENAI_MODEL).toBe('test-model')
    expect(process.env.VITE_OPENAI_API_KEY).toBeUndefined()
  })

  it('keeps OPENAI_API_KEY server-only and out of explicit client env config', () => {
    const source = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

    expect(source).toContain("'OPENAI_API_KEY'")
    expect(source).not.toContain("'VITE_OPENAI_API_KEY'")
    expect(source).not.toMatch(/define:\s*\{[\s\S]*OPENAI_API_KEY/)
  })
})
