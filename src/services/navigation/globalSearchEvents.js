export const GLOBAL_SEARCH_OPEN_EVENT = 'viktkollen:open-global-search'
export const GLOBAL_SEARCH_VOICE_START_EVENT = 'viktkollen:start-global-search-voice'
export const GLOBAL_SEARCH_VOICE_STATUS_EVENT = 'viktkollen:global-search-voice-status'

export function requestOpenGlobalSearch() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_OPEN_EVENT))
}

export function requestStartGlobalSearchVoice() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_VOICE_START_EVENT))
}

export function publishGlobalSearchVoiceStatus(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_VOICE_STATUS_EVENT, { detail }))
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
