function AccessibilityFeedback({ message, tone = 'info' }) {
  if (!message) return null

  return (
    <p aria-atomic="true" aria-live="polite" className={`accessibility-feedback is-${tone}`} role="status">
      {message}
    </p>
  )
}

export default AccessibilityFeedback
