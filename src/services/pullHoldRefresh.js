// Mobile pull-and-hold refresh. Only triggers when pulling from the top of the page.
export function installPullHoldRefresh() {
  if (typeof window === 'undefined' || !('ontouchstart' in window)) return () => {}

  const threshold = 85
  const holdMs = 650
  let startY = 0
  let tracking = false
  let armed = false
  let timer = null
  let indicator = null

  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
  }

  const hide = () => {
    clearTimer()
    tracking = false
    armed = false
    if (indicator) indicator.remove()
    indicator = null
  }

  const show = (message) => {
    if (!indicator) {
      indicator = document.createElement('div')
      indicator.setAttribute('role', 'status')
      indicator.setAttribute('aria-live', 'polite')
      Object.assign(indicator.style, {
        position: 'fixed', top: 'max(12px, env(safe-area-inset-top))',
        left: '50%', transform: 'translateX(-50%)',
        zIndex: '2147483647', padding: '9px 16px',
        borderRadius: '24px', background: '#172433', color: '#fff',
        font: '600 13px system-ui, sans-serif',
        boxShadow: '0 4px 16px #0004', pointerEvents: 'none',
      })
      document.body.appendChild(indicator)
    }
    indicator.textContent = message
  }

  const onStart = (event) => {
    hide()
    if (event.touches.length !== 1 || window.scrollY > 2) return
    const target = event.target
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
    // Avoid intercepting pulls inside independently scrolling panels.
    for (let el = target; el instanceof Element && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 3 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) return
    }
    startY = event.touches[0].clientY
    tracking = true
  }

  const onMove = (event) => {
    if (!tracking || event.touches.length !== 1) return
    const delta = event.touches[0].clientY - startY
    if (delta < 0 || window.scrollY > 2) { hide(); return }
    if (delta >= threshold && !armed) {
      armed = true
      show('Håll kvar för att uppdatera…')
      timer = window.setTimeout(() => {
        timer = null
        if (tracking && armed) {
          show('Uppdaterar…')
          window.location.reload()
        }
      }, holdMs)
    } else if (delta < threshold && armed) {
      armed = false
      clearTimer()
      if (indicator) { indicator.remove(); indicator = null }
    }
  }

  window.addEventListener('touchstart', onStart, { passive: true })
  window.addEventListener('touchmove', onMove, { passive: true })
  window.addEventListener('touchend', hide, { passive: true })
  window.addEventListener('touchcancel', hide, { passive: true })
  return () => {
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', hide)
    window.removeEventListener('touchcancel', hide)
    hide()
  }
}
