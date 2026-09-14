function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function updateHomeClock() {
  if (typeof document === 'undefined') return

  const clock = document.querySelector(
    '#app-section-home.is-active .overview-live-meta > p:nth-of-type(2) > span:nth-of-type(2)',
  )

  if (!clock) return

  const time = formatClock()
  const textNode = Array.from(clock.childNodes).findLast((node) => node.nodeType === Node.TEXT_NODE)

  if (textNode) {
    textNode.textContent = ` ${time}`
    return
  }

  clock.append(document.createTextNode(` ${time}`))
}

if (typeof window !== 'undefined') {
  updateHomeClock()
  window.setInterval(updateHomeClock, 1000)
}
