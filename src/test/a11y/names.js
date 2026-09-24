// A11Y-8G: WCAG 2.5.3 (Label in Name) and landmark checks for component
// tests (jsdom).
//
// labelInNameViolations mirrors the containment check of axe's experimental
// label-content-name-mismatch rule (curated: case, punctuation and symbols
// removed) but reads the DOM text instead of rendered pixels, so it is
// deterministic in jsdom. Controls without aria-label/aria-labelledby get
// their name from their content and therefore always contain their label.

const interactiveSelector = 'button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"]'

function curate(text) {
  return String(text || '')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Visible text of the element as a user sees it: aria-hidden subtrees still
// count (they are visible), hidden/[hidden] subtrees do not. Adjacent block
// children are separated, so "Titel" + "Beskrivning" is not "TitelBeskrivning".
export function visibleText(element) {
  const parts = []
  element.childNodes.forEach((node) => {
    if (node.nodeType === 3) parts.push(node.nodeValue)
    else if (node.nodeType === 1 && !node.hidden && !node.classList.contains('sr-only')) parts.push(` ${visibleText(node)} `)
  })
  return parts.join('')
}

function decorativeText(element) {
  return [...element.querySelectorAll('[aria-hidden="true"]')].map((node) => node.textContent).join(' ')
}

export function explicitName(element) {
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) return labelledBy.split(/\s+/).map((id) => element.ownerDocument.getElementById(id)?.textContent || '').join(' ')
  return element.getAttribute('aria-label')
}

// Returns controls whose explicit name does not contain their visible text.
// Decorative (aria-hidden) glyphs are ignored when they are only symbols.
export function labelInNameViolations(container, { exclude = [] } = {}) {
  return [...container.querySelectorAll(interactiveSelector)]
    .filter((element) => !exclude.some((selector) => element.matches(selector)))
    // Visually hidden controls have no visible label to match.
    .filter((element) => !element.closest('.sr-only, [hidden]'))
    .map((element) => {
      const name = explicitName(element)
      if (name === null || name === undefined) return null
      let text = curate(visibleText(element))
      const decorative = curate(decorativeText(element))
      if (decorative && !/\p{L}/u.test(decorative)) text = curate(text.replace(decorative, ' '))
      if (!/\p{L}/u.test(text)) return null
      return curate(name).includes(text) ? null : { name, text, element: element.outerHTML.slice(0, 120) }
    })
    .filter(Boolean)
}

const landmarkRoles = { aside: 'complementary', form: 'form', main: 'main', nav: 'navigation', section: 'region' }

// Named landmarks with the same role and name (axe landmark-unique).
export function duplicateLandmarks(container) {
  const seen = new Map()
  const duplicates = []
  container.querySelectorAll('section, nav, aside, main, form, [role="region"], [role="navigation"], [role="complementary"]').forEach((element) => {
    const role = element.getAttribute('role') || landmarkRoles[element.tagName.toLowerCase()]
    const name = curate(explicitName(element))
    // An unnamed section/form is not a landmark.
    if (!name && (role === 'region' || role === 'form')) return
    const key = `${role}:${name}`
    if (seen.has(key)) duplicates.push(key)
    else seen.set(key, element)
  })
  return duplicates
}
