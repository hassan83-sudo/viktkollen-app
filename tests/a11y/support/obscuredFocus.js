import { inspectFocusedElement, settleFocus } from './hiddenFocus.js'

// A11Y-8I (moved here from focus-visibility.spec.js in A11Y-8Z3, unchanged,
// so the Mer folder gate can use it too): WCAG 2.4.7 / 2.4.11 geometry of
// each Tab stop in real Chromium.

// Measures the focused element. Returns null when focus is in the bottom nav
// (the end of the view's own content) or on <body>.
export function measureFocus(page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return { body: true }
    if (element.closest('.bottom-nav')) return { nav: true }
    const name = (element.getAttribute('aria-label') || element.innerText || element.value || element.tagName).trim().split('\n')[0].slice(0, 40)
    const rect = element.getBoundingClientRect()
    const navTop = document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? window.innerHeight
    const problems = []
    if (rect.width < 2 || rect.height < 2) problems.push('zero-size')
    // Visually hidden ancestor (sr-only / clip / 1px box with hidden overflow).
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      if (node.classList.contains('sr-only') || style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)' || (box.width <= 1 && box.height <= 1 && style.overflow === 'hidden')) {
        problems.push(`inside-visually-hidden:${String(node.className).split(' ')[0]}`)
        break
      }
    }
    if (rect.top < 0 || rect.left < 0 || rect.right > window.innerWidth + 1) problems.push('outside-viewport')
    if (rect.bottom > navTop + 1) problems.push(`below-nav-top(${Math.round(rect.bottom)}>${Math.round(navTop)})`)
    // Covered: probe the centre and a point near the bottom edge.
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1)
    for (const y of [rect.top + rect.height / 2, rect.bottom - Math.min(4, rect.height / 4)]) {
      if (y < 0 || y >= window.innerHeight) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && hit !== element && !element.contains(hit) && !hit.contains(element)) {
        problems.push(`covered-by:${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`)
        break
      }
    }
    return { name, problems }
  })
}

export async function tabThroughView(page, maxStops = 70) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  const failures = []
  let stops = 0
  for (let index = 0; index < maxStops; index += 1) {
    await page.keyboard.press('Tab')
    // Let focus scrolling (browser + app) and focus transitions settle.
    await settleFocus(page)
    const result = await measureFocus(page)
    if (result.nav) break
    if (result.body) continue
    stops += 1
    const hidden = await page.evaluate(inspectFocusedElement)
    const problems = [...result.problems, ...(hidden.problems || []).filter((problem) => !problem.startsWith('inside-visually-hidden'))]
    if (problems.length) failures.push(`${result.name}: ${problems.join(', ')}`)
  }
  return { failures, stops }
}
