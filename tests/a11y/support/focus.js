import { expect } from '@playwright/test'

// A11Y-8F: small focus assertions shared by the keyboard specs.

export function activeElementSummary(page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return { tag: 'BODY', name: '' }
    const name = element.getAttribute('aria-label') || (element.innerText || element.value || '').trim().split('\n')[0]
    return { tag: element.tagName, name: name.slice(0, 80), role: element.getAttribute('role') || '' }
  })
}

// Important actions must leave focus somewhere meaningful, never on <body>.
export async function expectFocusNotOnBody(page) {
  await expect.poll(async () => (await activeElementSummary(page)).tag, { message: 'focus fell back to <body>' }).not.toBe('BODY')
}

export async function expectFocusInside(page, locator) {
  await expect.poll(() => locator.evaluate((element) => element.contains(document.activeElement)), { message: 'focus is not inside the expected container' }).toBe(true)
}

export async function expectFocused(locator) {
  await expect(locator).toBeFocused()
}

// Presses Tab/Shift+Tab `count` times and asserts focus never leaves `container`.
export async function expectTabTrappedIn(page, container, count = 20) {
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press(index % 3 === 2 ? 'Shift+Tab' : 'Tab')
    const inside = await container.evaluate((element) => element.contains(document.activeElement))
    expect(inside, `focus escaped the dialog after ${index + 1} key presses`).toBe(true)
  }
}

export async function expectBackgroundInert(page) {
  await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('main.app-shell')?.closest('[inert]')))).toBe(true)
}
