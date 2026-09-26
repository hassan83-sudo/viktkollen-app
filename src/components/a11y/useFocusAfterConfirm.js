import { useCallback, useEffect, useRef } from 'react'

// A11Y-8X4 (8M B13): focus fallback after a ConfirmDialog action. A confirmed
// delete removes the row (and the button that asked) in the same commit that
// closes the dialog, so the dialog may return focus to a button that is
// removed right after, and focus ends on <body>. Call the returned function
// with a ref when the action runs; after the next commit, if focus was lost
// (body, a removed element or a now disabled button), the ref's element gets
// focus. Same idea as the 8X3 effect in ProgressCenter.
export function useFocusAfterConfirm() {
  const targetRef = useRef(null)

  useEffect(() => {
    const target = targetRef.current
    if (!target) return
    targetRef.current = null
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected || active.disabled) target.current?.focus()
  })

  return useCallback((ref) => {
    targetRef.current = ref
  }, [])
}
