import { describe, expect, it } from 'vitest'
import { normalizeAppError } from './appErrorService.js'

describe('appErrorService', () => {
  it('classifies storage quota errors without leaking raw details', () => {
    const error = normalizeAppError(new DOMException('quota token=secret', 'QuotaExceededError'), { area: 'storage' })

    expect(error.safeCategory).toBe('storage')
    expect(error.safeUserMessage).toContain('Lagringsutrymmet')
    expect(error.diagnosticMessage).not.toContain('secret')
    expect(error.technicalCode).toMatch(/^storage-/)
  })

  it('classifies auth errors without requesting logout', () => {
    const error = normalizeAppError(new Error('JWT expired for user@example.com'), { area: 'auth' })

    expect(error.safeCategory).toBe('auth')
    expect(error.shouldLogout).toBe(false)
    expect(error.safeUserMessage).toContain('Inloggningen')
  })

  it('classifies network, timeout, conflict and import consistently', () => {
    expect(normalizeAppError(new Error('fetch failed')).safeCategory).toBe('network')
    expect(normalizeAppError(new Error('request timeout')).safeCategory).toBe('timeout')
    expect(normalizeAppError(new Error('sync conflict')).safeCategory).toBe('conflict')
    expect(normalizeAppError(new SyntaxError('JSON parse failed'), { area: 'import' }).safeCategory).toBe('import')
  })

  it('does not expose stack traces in user messages', () => {
    const error = normalizeAppError(new Error('boom at Object.render (/secret/file.js:1:1)'), { area: 'render' })

    expect(error.safeUserMessage).not.toMatch(/Object\.render|secret|file\.js/)
    expect(error.safeCategory).toBe('render')
  })
})
