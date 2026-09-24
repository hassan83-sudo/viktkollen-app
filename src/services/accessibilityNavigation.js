// A11Y-8E: navigation feedback for keyboard and screen-reader users.
//
// - document.title follows the current main section ("Hem – Viktkollen") and,
//   when a section shows a named sub view (for example a folder in Mer), that
//   view ("Tillgänglighet & hjälpmedel – Viktkollen").
// - after a real navigation, focus moves to the new view's primary heading,
//   so the change of content is announced and the next Tab continues there.

const appName = 'Viktkollen'
const titleState = { activeSection: '', details: new Map(), sectionLabel: '' }

export function formatDocumentTitle(label) {
  const clean = String(label || '').trim()
  return clean ? `${clean} – ${appName}` : appName
}

function applyDocumentTitle() {
  if (typeof document === 'undefined') return
  const detail = titleState.details.get(titleState.activeSection)
  document.title = formatDocumentTitle(detail || titleState.sectionLabel)
}

export function setDocumentSection(sectionId, label) {
  titleState.activeSection = sectionId || ''
  titleState.sectionLabel = label || ''
  applyDocumentTitle()
}

// A sub view inside a section (null/'' clears it). Only shown while that
// section is the active one.
export function setDocumentSectionDetail(sectionId, label) {
  if (!sectionId) return
  if (label) titleState.details.set(sectionId, label)
  else titleState.details.delete(sectionId)
  applyDocumentTitle()
}

// Moves focus to the primary heading of container (h1, else h2), or to the
// container itself. The target becomes programmatically focusable only
// (tabindex="-1"), so it is not added to the Tab order.
export function focusViewHeading(container) {
  if (!container || typeof container.querySelector !== 'function') return false
  const visible = (element) => !element.closest('[hidden], [inert]')
  const heading = [...container.querySelectorAll('h1')].find(visible)
    || [...container.querySelectorAll('h2')].find(visible)
  const target = heading || container
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  return target.ownerDocument.activeElement === target
}
