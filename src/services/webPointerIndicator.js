const POINTER_ID = 'viktkollen-web-pointer-indicator'

export function installWebPointerIndicator(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || doc.getElementById(POINTER_ID)) return () => {}

  const pointer = doc.createElement('div')
  pointer.id = POINTER_ID
  pointer.setAttribute('aria-hidden', 'true')
  Object.assign(pointer.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: '#ffffff',
    border: '2px solid #111827',
    boxShadow: '0 0 0 2px rgba(255,255,255,.35)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transform: 'translate(-50%, -50%)',
    display: 'none',
  })
  doc.body.appendChild(pointer)

  const showAt = (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return
    pointer.style.left = `${event.clientX}px`
    pointer.style.top = `${event.clientY}px`
    pointer.style.display = 'block'
  }
  const hide = () => { pointer.style.display = 'none' }

  doc.addEventListener('pointermove', showAt, { passive: true })
  doc.addEventListener('pointerleave', hide)

  return () => {
    doc.removeEventListener('pointermove', showAt)
    doc.removeEventListener('pointerleave', hide)
    pointer.remove()
  }
}
