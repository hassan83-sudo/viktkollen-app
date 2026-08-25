import { readFileSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vercel security headers', () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
  const headers = Object.fromEntries(
    (config.headers?.[0]?.headers || []).map((entry) => [entry.key, entry.value]),
  )

  it('is valid JSON with a catch-all header source', () => {
    expect(config.headers[0].source).toBe('/(.*)')
    expect(config.rewrites).toBeUndefined()
    expect(config.csp).toBeUndefined()
    expect(JSON.stringify(config)).not.toMatch(/Content-Security-Policy/i)
  })

  it('sets Permissions-Policy so Viktkollen can use camera, microphone and geolocation', () => {
    const policy = headers['Permissions-Policy']

    expect(policy).toContain('camera=(self)')
    expect(policy).toContain('microphone=(self)')
    expect(policy).toContain('geolocation=(self)')
    expect(policy).not.toMatch(/camera=\(\)/)
    expect(policy).not.toMatch(/microphone=\(\)/)
    expect(policy).not.toMatch(/geolocation=\(\)/)
    expect(policy).not.toMatch(/\*/)
  })

  it('sets the remaining baseline security headers without a CSP', () => {
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
  })
})
