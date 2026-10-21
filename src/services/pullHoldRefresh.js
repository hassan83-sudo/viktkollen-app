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
  let spinner = null
  let label = null

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
    spinner = null
    label = null
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
        display: 'flex', alignItems: 'center', gap: '9px',
        font: '600 13px system-ui, sans-serif',
        boxShadow: '0 4px 16px #0004', pointerEvents: 'none',
      })
      spinner = document.createElement('span')
      spinner.setAttribute('aria-hidden', 'true')
      Object.assign(spinner.style, {
        width: '18px', height: '18px', flexShrink: '0',
        border: '3px solid #ffffff55', borderTopColor: '#fff',
        borderRadius: '50%', transform: 'rotate(0deg)',
      })
      label = document.createElement('span')
      indicator.append(spinner, label)
      document.body.appendChild(indicator)
    }
    label.textContent = message
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
      if (spinner) {
        spinner.style.transition = 'transform 650ms linear'
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (spinner && armed) spinner.style.transform = 'rotate(360deg)'
        }))
      }
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
      if (indicator) { indicator.remove(); indicator = null; spinner = null; label = null }
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
