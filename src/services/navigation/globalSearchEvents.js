export const GLOBAL_SEARCH_OPEN_EVENT = 'viktkollen:open-global-search'

export function requestOpenGlobalSearch() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_OPEN_EVENT))
}

export function isEditableSearchShortcutTarget(target) {
  if (!target || typeof target !== 'object') return false

  const element = typeof target.closest === 'function'
    ? target.closest('input, textarea, select, [contenteditable="true"]') || target
    : target
  const tag = String(element.tagName || '').toLowerCase()

  if (tag === 'textarea' || tag === 'select') return true
  if (element.isContentEditable) return true
  if (tag !== 'input') return false

  const type = String(element.type || 'text').toLowerCase()
  return !['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'reset', 'submit'].includes(type)
}
