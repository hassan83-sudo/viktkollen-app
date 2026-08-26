export const BODY_SCAN_SESSION_CLASS = 'vk-body-scan-session'

export function setBodyScanSessionActive(active, root = typeof document === 'undefined' ? null : document) {
  if (!root?.documentElement) return { active: Boolean(active), navHidden: false }

  const on = Boolean(active)
  root.documentElement.classList.toggle(BODY_SCAN_SESSION_CLASS, on)
  root.body?.classList.toggle(BODY_SCAN_SESSION_CLASS, on)

  return { active: on, navHidden: on }
}
