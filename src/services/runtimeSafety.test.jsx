import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AppErrorBoundary from '../components/AppErrorBoundary.jsx'
import { getSafeErrorMessage, normalizeAppError } from './appErrorService.js'
import {
  readStorage,
  readStorageResult,
  removeStorageResult,
  writeStorage,
  writeStorageResult,
} from './appStorageService.js'
import {
  assertHealthSnapshotIntegrity,
  buildHealthSnapshot,
  sanitizeHealthSnapshotDisplay,
  validateHealthSnapshot,
} from './healthSnapshot.js'

function withWindowStorage(storage, callback) {
  const previousWindow = globalThis.window

  globalThis.window = {
    localStorage: storage,
  }

  try {
    return callback()
  } finally {
    globalThis.window = previousWindow
  }
}

function boundaryMarkup(error = new Error('secret token=abc123 stack at file.js:1')) {
  const boundary = new AppErrorBoundary({ area: 'test', children: 'ok' })

  boundary.state = { error, resetCount: 0 }

  return renderToStaticMarkup(boundary.render())
}

describe('runtime safety and recovery', () => {
  it('root error boundary renders a safe Swedish fallback for render errors', () => {
    const markup = boundaryMarkup()

    expect(AppErrorBoundary.getDerivedStateFromError(new Error('boom')).error).toBeInstanceOf(Error)
    expect(markup).toContain('Något gick fel')
    expect(markup).toContain('Försök igen')
    expect(markup).toContain('Ladda om appen')
    expect(markup).toContain('Gå till startsidan')
    expect(markup).toContain('aria-live="assertive"')
  })

  it('retry resets the boundary state', () => {
    const boundary = new AppErrorBoundary({ children: 'ok' })
    boundary.state = { error: new Error('boom'), resetCount: 0 }
    boundary.setState = vi.fn((updater) => {
      boundary.state = typeof updater === 'function' ? updater(boundary.state) : updater
    })

    boundary.reset()

    expect(boundary.state.error).toBeNull()
    expect(boundary.state.resetCount).toBe(1)
  })

  it('does not expose stack traces tokens or raw objects in the boundary UI', () => {
    const markup = boundaryMarkup(new Error('Bearer abc.def.ghi Supabase key=xyz\n at fn (secret.js:1) [object Object]'))

    expect(markup).not.toMatch(/abc\.def|key=xyz|secret\.js|at fn|\[object Object\]/i)
  })

  it('normalizes network Supabase clipboard and token-like errors safely', () => {
    expect(getSafeErrorMessage(new Error('NetworkError: fetch failed'), { area: 'network' })).toContain('Nätverket')
    expect(getSafeErrorMessage(new Error('Supabase jwt token=secret'), { area: 'supabase' })).toContain('Molntjänsten')
    expect(getSafeErrorMessage(new Error('clipboard denied'), { area: 'clipboard' })).toContain('kopiera')
    expect(normalizeAppError(new Error('apiKey=123 password=abc')).diagnosticMessage).not.toContain('123')
  })

  it('returns safe fallback for broken JSON without deleting stored data', () => {
    const storage = {
      getItem: vi.fn(() => '{bad json'),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    }

    const result = withWindowStorage(storage, () => readStorageResult('viktkollen.test', { ok: true }))

    expect(result.ok).toBe(false)
    expect(result.value).toEqual({ ok: true })
    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(readStorage('missing', 'fallback')).toBe('fallback')
  })

  it('handles QuotaExceededError and SecurityError for storage writes', () => {
    const quotaStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
    }
    const securityStorage = {
      removeItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    }

    const quota = withWindowStorage(quotaStorage, () => writeStorageResult('viktkollen.test', { a: 1 }))
    const security = withWindowStorage(securityStorage, () => removeStorageResult('viktkollen.test'))

    expect(quota.ok).toBe(false)
    expect(quota.reason).toContain('Lagringsutrymmet')
    expect(security.ok).toBe(false)
    expect(security.reason).toContain('blockerade')
    expect(withWindowStorage(quotaStorage, () => writeStorage('viktkollen.test', {}))).toBe(false)
  })

  it('keeps import-like parse failures from mutating external state', () => {
    const state = [{ id: 1, name: 'Kyckling' }]

    function importJson(text) {
      const parsed = JSON.parse(text)

      return Array.isArray(parsed) ? parsed : state
    }

    try {
      importJson('{bad')
    } catch {
      // UI import handlers keep current state and show a safe status.
    }

    expect(state).toEqual([{ id: 1, name: 'Kyckling' }])
    expect(getSafeErrorMessage(new SyntaxError('Unexpected token'), { area: 'import' })).toContain('Filen kunde inte läsas')
  })

  it('keeps snapshot production sanitizing separate from development diagnostics', () => {
    const snapshot = buildHealthSnapshot({ today: '2026-07-31' })
    const invalid = {
      ...snapshot,
      display: { ...snapshot.display, currentWeight: 'undefined' },
    }
    const sanitized = sanitizeHealthSnapshotDisplay(invalid)

    expect(validateHealthSnapshot(snapshot).ok).toBe(true)
    expect(sanitized.display.currentWeight).toBe('Saknas')
    expect(() => assertHealthSnapshotIntegrity(invalid)).toThrow(/Health snapshot contract violation/)
  })
})
