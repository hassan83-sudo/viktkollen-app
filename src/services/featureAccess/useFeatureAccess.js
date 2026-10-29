import { useCallback, useEffect, useRef, useState } from 'react'
import { loadFeatureAccess } from './featureAccessClient.js'

const DEFAULT_RECHECK_MS = 60 * 1000

/**
 * Behörighet för en spärrad funktion: 'checking' | 'allowed' | 'locked'.
 * Startar som 'checking', så inget som kräver behörighet kan visas innan
 * servern har svarat. Kontrolleras igen med jämna mellanrum och när appen
 * blir synlig. ensure() gör en ny kontroll direkt (t.ex. före mikrofonstart)
 * och svarar true bara om servern just godkände. lock() spärrar direkt, t.ex.
 * när en rutt svarar FEATURE_LOCKED.
 */
export function useFeatureAccess(featureKey, { load = loadFeatureAccess, recheckMs = DEFAULT_RECHECK_MS } = {}) {
  const [state, setState] = useState('checking')
  const loadRef = useRef(load)
  const mountedRef = useRef(true)
  useEffect(() => {
    loadRef.current = load
  })

  const ensure = useCallback(async () => {
    let result
    try {
      result = await loadRef.current(featureKey)
    } catch {
      result = 'locked'
    }
    const allowed = result === 'allowed'
    if (mountedRef.current) setState(allowed ? 'allowed' : 'locked')
    return allowed
  }, [featureKey])

  const lock = useCallback(() => {
    if (mountedRef.current) setState('locked')
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const first = setTimeout(() => { void ensure() }, 0)
    const timer = recheckMs > 0 ? setInterval(() => { void ensure() }, recheckMs) : null
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void ensure()
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
    return () => {
      mountedRef.current = false
      clearTimeout(first)
      if (timer) clearInterval(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ensure, recheckMs])

  return { ensure, lock, state }
}
