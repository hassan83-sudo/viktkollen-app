const snoozeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20]

function isSnoozeButton(button) {
  const text = button?.textContent?.trim().toLowerCase() || ''
  return text.startsWith('snooza') || text.startsWith('snooze')
}

function enhanceSnoozeControls() {
  document.querySelectorAll('.notice-reminder-list .notice-actions').forEach((actions) => {
    const button = [...actions.querySelectorAll('button')].find(isSnoozeButton)
    if (!button) return

    let select = actions.querySelector('[data-snooze-minutes]')
    if (!select) {
      select = document.createElement('select')
      select.dataset.snoozeMinutes = 'true'
      select.setAttribute('aria-label', 'Snooze tid')

      snoozeOptions.forEach((minutes) => {
        const option = document.createElement('option')
        option.value = String(minutes)
        option.textContent = `${minutes} min`
        if (minutes === 5) option.selected = true
        select.appendChild(option)
      })

      actions.insertBefore(select, button)
    }

    const lower = button.textContent.trim().toLowerCase()
    button.textContent = lower.startsWith('snooza') ? 'Snooza' : 'Snooze'
  })
}

function captureSnoozeChoice(event) {
  const button = event.target?.closest?.('.notice-reminder-list .notice-actions button')
  if (!isSnoozeButton(button)) return
  const actions = button.closest('.notice-actions')
  const select = actions?.querySelector('[data-snooze-minutes]')
  const minutes = Number(select?.value)
  if (!Number.isFinite(minutes)) return
  window.__viktkollenSnoozeMinutes = minutes
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  queueMicrotask(enhanceSnoozeControls)
  document.addEventListener('click', captureSnoozeChoice, true)
  const observer = new MutationObserver(enhanceSnoozeControls)
  observer.observe(document.documentElement, { childList: true, subtree: true })
}
