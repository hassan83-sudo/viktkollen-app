import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { measureBoundary, measureContrast } from './support/contrast.js'

// A11Y-8O: Mer → AI Coach (8M A-N2, A-N3, B-N1).
//
// Contrast (WCAG 1.4.3 / 1.4.11) is measured on the rendered page, including
// the 72 % opacity of locked badges (see support/contrast.js).

async function openAiCoach(page, preferences = null) {
  await openApp(page, { preferences, reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: /^AI Coach/ }).first()
  await folder.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#achievements')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('#achievements .achievement-card').first()).toBeVisible()
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    await Promise.all(finite.map((animation) => animation.finished.catch(() => {})))
  })
}

const modes = { default: null, 'high-contrast': { highContrast: true } }

for (const [modeName, preferences] of Object.entries(modes)) {
  test.describe(`AI Coach contrast (${modeName})`, () => {
    test('achievement chips, headings, badges and social cards reach WCAG AA', async ({ page }, testInfo) => {
      await openAiCoach(page, preferences)

      const named = {
        'active chip "Alla"': '#achievements .achievement-filter button.is-active',
        'inactive chip': '#achievements .achievement-filter button:not(.is-active)',
        'section heading "Badges"': '#achievements .achievement-section-heading > h3',
        'badge heading': '#achievements .achievement-card h3',
        'badge text': '#achievements .achievement-card p',
        'badge progress text': '#achievements .achievement-card-footer span',
        'locked badge': '#achievements .achievement-card-locked h3, #achievements .achievement-card-locked .achievement-card-footer strong',
        'unlocked badge': '#achievements .achievement-card-unlocked h3, #achievements .achievement-card-unlocked .achievement-card-footer strong',
        'section text': '#achievements .achievement-section > p',
        'social card': '#social-center .social-card h3, #social-center .social-card p, #social-center .social-card small',
      }
      const results = {}
      for (const [label, selector] of Object.entries(named)) {
        results[label] = await page.evaluate(measureContrast, selector)
        expect(results[label].length, `${label} is rendered`).toBeGreaterThan(0)
      }
      // Everything else with text in the Achievements panel and social cards.
      results['all achievement and social text'] = await page.evaluate(measureContrast, '#achievements *, #social-center .social-card *')

      // The inactive chip on hover: the theme turns every button cyan.
      const inactive = page.locator('#achievements .achievement-filter button:not(.is-active)').first()
      await inactive.hover()
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})))
      })
      results['inactive chip, hover'] = await page.evaluate(measureContrast, '#achievements .achievement-filter button:hover')
      await page.mouse.move(0, 0)

      await testInfo.attach(`ai-coach-contrast-${modeName}.json`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
      const failures = Object.entries(results).flatMap(([label, items]) => items
        .filter((item) => item.ratio < item.required)
        .map((item) => `${label}: "${item.text}" ${item.foreground} on ${item.background} = ${item.ratio}:1 (needs ${item.required}:1)`))
      expect(failures).toEqual([])

      // The active chip stands out from the section behind it (1.4.11).
      const boundary = await page.locator('#achievements .achievement-filter button.is-active').evaluate(measureBoundary)
      expect(boundary, 'active chip against its surroundings').toBeGreaterThanOrEqual(3)
    })
  })
}

async function axNode(cdp, root, selector) {
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
  expect(nodeId, selector).toBeTruthy()
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
  const node = nodes[0]
  const properties = Object.fromEntries((node.properties || []).map((property) => [property.name, property.value?.value]))
  return { ignored: node.ignored, name: node.name?.value || '', properties, role: node.role?.value, value: node.value?.value }
}

async function axNodes(cdp, root, selector) {
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })
  const result = []
  for (const nodeId of nodeIds) {
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const { node } = await cdp.send('DOM.describeNode', { nodeId })
    const attributes = Object.fromEntries((node.attributes || []).reduce((pairs, value, index, list) => (index % 2 ? pairs : [...pairs, [value, list[index + 1]]]), []))
    result.push({ attributes, ignored: nodes[0].ignored, name: nodes[0].name?.value || '', role: nodes[0].role?.value })
  }
  return result
}

const normalize = (text) => text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('sv-SE')

test.describe('AI Coach semantics (8M A-N3)', () => {
  test('progress and groups have real roles; no named <div> without a role anywhere in the folder', async ({ page }) => {
    await openAiCoach(page)
    const cdp = await page.context().newCDPSession(page)
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })

    // Level progress: not shown as text, so it is a named progressbar whose
    // value matches the drawn bar.
    const level = await axNode(cdp, root, '#achievements .metric-primary .achievement-progress')
    expect(level.role).toBe('progressbar')
    expect(level.name).toBe('Nivåprogress')
    expect(level.properties).toMatchObject({ valuemax: 100, valuemin: 0 })
    const drawn = await page.locator('#achievements .metric-primary .achievement-progress span').evaluate((element) => Math.round(Number.parseFloat(element.style.width)))
    expect(level.value).toBe(drawn)

    // Bars next to a visible "1 av 3" text are decorative.
    const bars = await axNodes(cdp, root, '#achievements .achievement-progress')
    expect(bars.length).toBeGreaterThan(10)
    for (const bar of bars.filter((candidate) => candidate.role !== 'progressbar')) {
      expect(bar.ignored, 'decorative bar is hidden').toBe(true)
      expect(bar.attributes['aria-label'], 'decorative bar has no name').toBeUndefined()
    }
    expect(bars.filter((bar) => bar.role === 'progressbar')).toHaveLength(1)

    // The badge filter is a named group of toggle buttons.
    const filter = await axNode(cdp, root, '#achievements .achievement-filter')
    expect(filter).toMatchObject({ name: 'Filtrera achievements', role: 'group' })
    const active = await axNode(cdp, root, '#achievements .achievement-filter button.is-active')
    expect(active).toMatchObject({ name: 'Alla', role: 'button' })
    expect(active.properties.pressed).toBe('true')

    // No element in the AI Coach folder has an aria-label that is dropped
    // because the element has no role (aria-prohibited-attr).
    const { nodes } = await cdp.send('Accessibility.getFullAXTree')
    const namedGeneric = []
    for (const node of nodes.filter((candidate) => !candidate.ignored && ['generic', 'none'].includes(candidate.role?.value) && candidate.name?.value)) {
      const { node: dom } = await cdp.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId })
      namedGeneric.push(`${dom.localName} "${node.name.value}"`)
    }
    expect(namedGeneric).toEqual([])
    await cdp.detach()
  })
})

test.describe('AI Coach label in name (8M B-N1)', () => {
  test('every badge and every button in Achievements is named with its visible label and its real state', async ({ page }) => {
    await openAiCoach(page)
    const cdp = await page.context().newCDPSession(page)
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })

    const stateWords = { 'achievement-card-inProgress': 'pågår', 'achievement-card-locked': 'låst', 'achievement-card-unlocked': 'upplåst' }
    const cards = await axNodes(cdp, root, '#achievements article.achievement-card')
    expect(cards.length).toBeGreaterThan(10)
    const cardTitles = await page.locator('#achievements article.achievement-card h3').allInnerTexts()
    const problems = []
    cards.forEach((card, index) => {
      const title = normalize(cardTitles[index])
      const state = Object.entries(stateWords).find(([className]) => card.attributes.class.split(' ').includes(className))?.[1]
      if (!normalize(card.name).startsWith(title)) problems.push(`card "${cardTitles[index]}": name "${card.name}" does not start with its heading`)
      if (!state || !normalize(card.name).endsWith(`, ${state}`)) problems.push(`card "${cardTitles[index]}": name "${card.name}" does not end with its state "${state}"`)
    })

    // Every button (filters, "Markera sedd", challenges): the visible label
    // is part of the accessible name.
    const buttons = await axNodes(cdp, root, '#achievements button')
    const labels = await page.locator('#achievements button').allInnerTexts()
    expect(buttons.length).toBeGreaterThan(5)
    buttons.forEach((button, index) => {
      if (!normalize(button.name).includes(normalize(labels[index]))) problems.push(`button "${labels[index]}": name "${button.name}"`)
    })
    expect(problems).toEqual([])

    // An unlocked, unseen badge has "Markera sedd" and it says which badge.
    const seen = page.locator('#achievements .achievement-card-unlocked button', { hasText: 'Markera sedd' }).first()
    if (await seen.count()) {
      const title = await seen.locator('xpath=ancestor::article[1]//h3').innerText()
      await expect(seen).toHaveAccessibleName(`Markera sedd: ${title}`)
    }
    await cdp.detach()
  })
})
