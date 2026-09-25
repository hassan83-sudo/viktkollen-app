// A11Y-8N (8M C-N2): generic hidden-focus gate.
//
// Runs in the page after a real Tab press and describes the focused element.
// It fails a Tab stop that the keyboard user cannot see:
//
// - the element itself, or an ancestor, is visually hidden: .sr-only /
//   .visually-hidden, clip: rect(0 0 0 0), clip-path: inset(50%), a box of at
//   most 1x1 px (the element itself, or an ancestor with hidden overflow);
// - it is transparent (opacity 0 on itself or an ancestor) or not rendered
//   (visibility hidden, no layout box);
// - it sits off-screen (e.g. left: -9999px) after the browser has scrolled
//   it into view;
// - it has no focus indicator of its own (outline or box-shadow).
//
// Only elements that the keyboard actually reaches are measured. Screen
// reader only text, live regions and status messages are never Tab stops, so
// they are not affected. A skip link that becomes visible on focus is measured
// in its focused (visible) state and passes.
//
// The function is self-contained: Playwright serialises it into the page.
export function inspectFocusedElement() {
  const element = document.activeElement
  if (!element || element === document.body || element === document.documentElement) return { body: true }
  if (element.closest('.bottom-nav')) return { nav: true }

  const label = (element.getAttribute('aria-label') || element.innerText || element.value || '').trim().split('\n')[0].slice(0, 50)
  const type = element.getAttribute('type')
  const name = `${element.tagName.toLowerCase()}${type ? `[type=${type}]` : ''} "${label}"`
  const problems = []
  const view = element.ownerDocument.defaultView

  const isHiddenClass = (node) => node.classList.contains('sr-only') || node.classList.contains('visually-hidden')
  const isClipped = (style) => style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)'

  const selfStyle = view.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  if (isHiddenClass(element) || isClipped(selfStyle)) problems.push('self-visually-hidden')
  else if (rect.width <= 1 || rect.height <= 1) problems.push(`self-tiny(${Math.round(rect.width)}x${Math.round(rect.height)})`)
  if (selfStyle.visibility !== 'visible' || element.getClientRects().length === 0) problems.push('not-rendered')

  let opacity = Number.parseFloat(selfStyle.opacity)
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = view.getComputedStyle(node)
    opacity *= Number.parseFloat(style.opacity)
    const box = node.getBoundingClientRect()
    if (isHiddenClass(node) || isClipped(style) || (box.width <= 1 && box.height <= 1 && style.overflow === 'hidden')) {
      problems.push(`inside-visually-hidden:${String(node.className).split(' ')[0] || node.tagName.toLowerCase()}`)
      break
    }
  }
  if (opacity < 0.1) problems.push('transparent')

  if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= view.innerWidth || rect.top >= view.innerHeight) problems.push('off-screen')

  const outline = selfStyle.outlineStyle !== 'none' && Number.parseFloat(selfStyle.outlineWidth) > 0
  const ring = selfStyle.boxShadow && selfStyle.boxShadow !== 'none'
  if (!outline && !ring) problems.push('no-focus-indicator')

  return { name, problems, rect: { height: rect.height, left: rect.left, top: rect.top, width: rect.width } }
}

// Lets focus scrolling and focus transitions finish before measuring.
export function settleFocus(page) {
  return page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    await Promise.all(finite.map((animation) => animation.finished.catch(() => {})))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  })
}

// Tabs through the current view until focus reaches the bottom navigation
// and returns every stop with its problems.
export async function tabStops(page, maxStops = 90) {
  // Start at the top of the document. blur() alone keeps Chromium's
  // sequential focus starting point (e.g. a heading focused when a folder
  // opened), so a temporary, non-tabbable anchor is focused first.
  await page.evaluate(() => {
    const anchor = document.createElement('span')
    anchor.id = 'a11y-tab-start'
    anchor.tabIndex = -1
    document.body.prepend(anchor)
    anchor.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  })
  const stops = []
  for (let index = 0; index < maxStops; index += 1) {
    await page.keyboard.press('Tab')
    if (index === 0) await page.evaluate(() => document.getElementById('a11y-tab-start')?.remove())
    await settleFocus(page)
    const stop = await page.evaluate(inspectFocusedElement)
    if (stop.nav) break
    if (stop.body) continue
    stops.push(stop)
  }
  return stops
}

export function hiddenFocusFailures(stops) {
  return stops.filter((stop) => stop.problems.length).map((stop) => `${stop.name}: ${stop.problems.join(', ')}`)
}
