import { useEffect, useRef, useState } from 'react'

// One automatic attempt per account and input key in this mounted app.
// StrictMode replays, rerenders and section navigation must not send another
// request. A failed call, including HTTP 429, is not retried for the same key.
export function useProactiveCoachRequest({ userId, enabled, requestKey, request }) {
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
    if (!userId || !enabled || !requestKey || scope.requested.has(requestKey)) return
    scope.requested.add(requestKey)
    const isCurrent = () => mounted.current && scopeRef.current === scope
    void (async () => {
      let insights = null
      try { insights = await request(isCurrent) } catch { /* Use local fallback, no retry. */ }
      if (!isCurrent()) return
      setState((previous) => ({
        scope,
        results: {
          ...(previous.scope === scope ? previous.results : {}),
          [requestKey]: { insights, key: requestKey, userId },
        },
      }))
    })()
  }, [enabled, request, requestKey, userId])
  return state.scope?.userId === userId ? state.results[requestKey] || null : null
}
