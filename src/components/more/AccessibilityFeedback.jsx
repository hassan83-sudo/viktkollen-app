// A11Y-8A: the status region is always rendered, even before the first
// message, because many screen readers only announce changes inside a live
// region that already existed in the DOM. While empty it uses the global
// sr-only class, so no empty visual box is shown.
//
// announcementId lets a caller re-announce an identical message on purpose
// (e.g. "Saved" after a second save): the message text is re-keyed, so the
// text node is replaced inside the stable region and announced again. Callers
// that keep the same id get no duplicate announcement for repeated renders.
function AccessibilityFeedback({ announcementId, id, message, tone = 'info' }) {
  return (
    <p
      aria-atomic="true"
      aria-live="polite"
      className={message ? `accessibility-feedback is-${tone}` : 'sr-only'}
      id={id}
      role="status"
    >
      {message ? <span key={announcementId ?? 'message'}>{message}</span> : null}
    </p>
  )
}

export default AccessibilityFeedback
