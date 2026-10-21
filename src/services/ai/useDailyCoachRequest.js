import { useEffect, useRef, useState } from 'react'

// One attempt per day in this mounted app and account generation, including
// StrictMode effect replay. Failed calls are not retried on unrelated renders.
export function useDailyCoachRequest({ userId, day, enabled, request }) {
  const scopeRef = useRef({ userId: null, requested: new Set() })
  const mounted = useRef(false)
  const [state, setState] = useState({ scope: null, results: {} })
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (scopeRef.current.userId !== userId) scopeRef.current = { userId, requested: new Set() }
    const scope = scopeRef.current
    if (!userId || !enabled || scope.requested.has(day)) return
    scope.requested.add(day)
    const isCurrent = () => mounted.current && scopeRef.current === scope
    void (async () => {
      let result
      try { result = await request(isCurrent) } catch { /* Use local fallback, no retry. */ }
      if (!isCurrent()) return
      const summary = result?.ok && typeof result.data?.summary === 'string' ? result.data.summary.trim() : ''
      setState((previous) => ({
        scope,
        results: {
          ...(previous.scope === scope ? previous.results : {}),
          [day]: { key: day, userId, summary, source: summary && result.data.source === 'openai' ? 'openai' : 'mock' },
        },
      }))
    })()
  }, [day, enabled, request, userId])
  return state.scope?.userId === userId ? state.results[day] || null : null
}
