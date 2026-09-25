// A11Y-8O: contrast as rendered, for Chromium specs (WCAG 1.4.3 / 1.4.11).
//
// The colour the user sees is built by compositing every background from the
// page down to the element (background colours and linear-gradient stops, the
// worst stop wins), the text colour with its alpha, and every ancestor's
// opacity applied to its whole subtree. Radial glows are left out, as in
// navigation-contrast.spec.js. Both functions are self-contained: Playwright
// serialises them into the page.

// Runs in the page. For every element matching `selector` with its own text,
// returns the rendered text/background contrast and the WCAG requirement.
export function measureContrast(selector) {
  const parse = (value) => {
    const match = String(value).match(/rgba?\(([^)]+)\)/)
    if (!match) return null
    const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number.parseFloat)
    return { a, b, g, r }
  }
  const over = (top, bottom) => ({ a: 1, b: top.b * top.a + bottom.b * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), r: top.r * top.a + bottom.r * (1 - top.a) })
  const mix = (one, two, amount) => ({ a: 1, b: one.b * amount + two.b * (1 - amount), g: one.g * amount + two.g * (1 - amount), r: one.r * amount + two.r * (1 - amount) })
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const ratio = (one, two) => {
    const [light, dark] = [luminance(one), luminance(two)].sort((x, y) => y - x)
    return (light + 0.05) / (dark + 0.05)
  }
  // Every background the element could show: its colour, then each
  // linear-gradient stop on top.
  const backgroundsOf = (style) => {
    const base = parse(style.backgroundColor) || { a: 0, b: 0, g: 0, r: 0 }
    const linear = style.backgroundImage.match(/linear-gradient\((.*)\)/)?.[1] || ''
    const stops = [...linear.matchAll(/rgba?\([^)]+\)/g)].map((match) => parse(match[0]))
    return stops.length ? stops.map((stop) => ({ layer: base, stop })) : [{ layer: base, stop: null }]
  }

  // Renders the text pixel and the background pixel of `element`,
  // compositing from the root down and applying each ancestor's opacity to
  // its whole subtree (group opacity).
  function render(element) {
    const chain = []
    for (let node = element; node; node = node.parentElement) chain.unshift(node)
    const text = parse(getComputedStyle(element).color)
    let worst = null
    const variants = chain.map((node) => backgroundsOf(getComputedStyle(node)))
    const combinations = variants.reduce((all, options) => all.flatMap((prefix) => options.map((option) => [...prefix, option])), [[]]).slice(0, 64)
    for (const combination of combinations) {
      const renderFrom = (index, backdrop, withText) => {
        const node = chain[index]
        const opacity = Number.parseFloat(getComputedStyle(node).opacity)
        const { layer, stop } = combination[index]
        let inner = over(layer, backdrop)
        if (stop) inner = over(stop, inner)
        inner = index === chain.length - 1 ? (withText ? over(text, inner) : inner) : renderFrom(index + 1, inner, withText)
        return mix(inner, backdrop, opacity)
      }
      const page = { a: 1, b: 255, g: 255, r: 255 }
      const foreground = renderFrom(0, page, true)
      const background = renderFrom(0, page, false)
      const value = ratio(foreground, background)
      if (!worst || value < worst.value) worst = { background, foreground, value }
    }
    const style = getComputedStyle(element)
    const size = Number.parseFloat(style.fontSize)
    const bold = Number.parseInt(style.fontWeight, 10) >= 700
    const large = size >= 24 || (bold && size >= 18.66)
    const hex = ({ r, g, b }) => `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
    return {
      background: hex(worst.background),
      foreground: hex(worst.foreground),
      large,
      ratio: Math.round(worst.value * 100) / 100,
      required: large ? 3 : 4.5,
    }
  }

  const ownText = (element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
  return [...document.querySelectorAll(selector)]
    .filter((element) => ownText(element) && element.getClientRects().length && getComputedStyle(element).visibility === 'visible')
    .map((element) => ({ text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 50), ...render(element) }))
}

// Non-text contrast of a control's boundary against what is around it
// (WCAG 1.4.11): the rendered background of the control against the
// rendered background of its parent.
export function measureBoundary(element) {
  const parse = (value) => {
    const match = String(value).match(/rgba?\(([^)]+)\)/)
    if (!match) return null
    const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number.parseFloat)
    return { a, b, g, r }
  }
  const over = (top, bottom) => ({ a: 1, b: top.b * top.a + bottom.b * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), r: top.r * top.a + bottom.r * (1 - top.a) })
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const composite = (target) => {
    const chain = []
    for (let node = target; node; node = node.parentElement) chain.unshift(node)
    return chain.reduce((backdrop, node) => over(parse(getComputedStyle(node).backgroundColor) || { a: 0, b: 0, g: 0, r: 0 }, backdrop), { a: 1, b: 255, g: 255, r: 255 })
  }
  const [light, dark] = [luminance(composite(element)), luminance(composite(element.parentElement))].sort((x, y) => y - x)
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100
}
