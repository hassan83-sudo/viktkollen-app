import { useCallback, useEffect, useRef, useState } from 'react'
import { loadFeatureAccess } from './featureAccessClient.js'
import { supabase } from '../supabaseClient.js'

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
  const requestRef = useRef(0)
  const expiryTimerRef = useRef(null)
  useEffect(() => {
    loadRef.current = load
  })

  const ensure = useCallback(async () => {
    const request = ++requestRef.current
    let result
    try {
      result = await loadRef.current(featureKey)
    } catch {
      result = 'locked'
    }
    const expiresAt = result?.expiresAt
    const allowed = result === 'allowed' || (result?.state === 'allowed' && Number.isFinite(expiresAt) && expiresAt > Date.now())
    if (mountedRef.current && request === requestRef.current) {
      clearTimeout(expiryTimerRef.current)
      setState(allowed ? 'allowed' : 'locked')
      if (allowed && Number.isFinite(expiresAt)) {
        expiryTimerRef.current = setTimeout(() => setState('locked'), Math.min(expiresAt - Date.now(), 2147483647))
      }
    }
    return allowed
  }, [featureKey])

  const lock = useCallback(() => {
    ++requestRef.current
    clearTimeout(expiryTimerRef.current)
    if (mountedRef.current) setState('locked')
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const first = setTimeout(() => { void ensure() }, 0)
    const timer = recheckMs > 0 ? setInterval(() => { void ensure() }, recheckMs) : null
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void ensure()
    }
    const authSubscription = supabase?.auth?.onAuthStateChange?.(() => {
      ++requestRef.current
      clearTimeout(expiryTimerRef.current)
      setState('checking')
      void ensure()
    })
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
    if (typeof window !== 'undefined') window.addEventListener('viktkollen:subscription-changed', ensure)
    return () => {
      mountedRef.current = false
      ++requestRef.current
      clearTimeout(expiryTimerRef.current)
      authSubscription?.data?.subscription?.unsubscribe()
      clearTimeout(first)
      if (timer) clearInterval(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
      if (typeof window !== 'undefined') window.removeEventListener('viktkollen:subscription-changed', ensure)
    }
  }, [ensure, recheckMs])

  return { ensure, lock, state }
}
