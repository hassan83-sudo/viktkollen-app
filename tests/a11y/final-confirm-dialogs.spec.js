import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8X6 (8M B13): the last Claude-owned window.confirm calls in the app
// (docs/accessibility/A11Y_8X6_FINAL_CONFIRM_DIALOGS.md): coach history
// (AI Coach), a progress photo (Framstegsbilder) and the accessibility reset
// (Tillgänglighet). GoalsHabitsPanel, CoachMemoryReview and the dev-only
// ManualAcceptanceRunner are covered in jsdom
// (src/components/a11y/finalConfirmDialogs.test.jsx).

const moderate = ['critical', 'serious', 'moderate']
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function openFolder(page, name) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

function watchNativeDialogs(page) {
  const seen = []
  page.on('dialog', async (dialog) => {
    seen.push(dialog.type())
    await dialog.dismiss()
  })
  return seen
}

async function expectFocusVisibleNotBody(page) {
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await settleFocus(page)
  const focused = await page.evaluate(inspectFocusedElement)
  expect(focused.body, 'focus on <body>').toBeUndefined()
  expect(focused.problems, focused.name).toEqual([])
}

async function openConfirm(page, trigger, name, description) {
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog', { name })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAccessibleDescription(description)
  await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeFocused()
  return dialog
}

async function confirmWithKeyboard(page, dialog) {
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
}

test.describe('final confirm dialogs (8M B13)', () => {
  test('AI Coach: clear coach history', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openFolder(page, 'AI Coach')
    const create = page.getByRole('button', { name: 'Skapa coachrapport' })
    await create.click()
    const reports = page.locator('.coach-v2-report')
    await expect(reports.first()).toBeVisible({ timeout: 15000 })
    const clear = page.getByRole('button', { name: 'Rensa historik' })

    let dialog = await openConfirm(page, clear, 'Rensa coachhistorik', 'Vill du rensa all coachhistorik?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-clear-coach-history', { block: moderate, include: '.confirm-dialog' })
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Rensa' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(clear).toBeFocused()
    await expect(reports).not.toHaveCount(0)

    dialog = await openConfirm(page, clear, 'Rensa coachhistorik', 'Vill du rensa all coachhistorik?')
    await confirmWithKeyboard(page, dialog)
    await expect(reports).toHaveCount(0)
    // The button goes with the history; the panel heading takes focus.
    await expect(page.locator(':focus')).toHaveText('Personlig coach')
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })

  test('Framstegsbilder: remove a progress photo', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openFolder(page, 'Framsteg')
    await page.getByRole('button', { name: /^Framstegsbilder/ }).click()
    await page.locator('#app-section-more .progress-photo-upload-card input[type="file"]').first().setInputFiles({ buffer: png, mimeType: 'image/png', name: 'front.png' })
    const remove = page.locator('#app-section-more .progress-photo-actions').getByRole('button', { name: 'Ta bort' })
    await expect(remove).toHaveCount(1)

    let dialog = await openConfirm(page, remove, 'Ta bort framstegsbild', 'Vill du ta bort den här framstegsbilden?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-delete-photo', { block: moderate, include: '.confirm-dialog' })
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(remove).toBeFocused()
    await expect(remove).toHaveCount(1)

    dialog = await openConfirm(page, remove, 'Ta bort framstegsbild', 'Vill du ta bort den här framstegsbilden?')
    await confirmWithKeyboard(page, dialog)
    await expect(remove).toHaveCount(0)
    await expect(page.locator(':focus')).toHaveText('Framstegsbilder')
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })

  test('Tillgänglighet: reset asks; Avbryt keeps the setting, confirm resets it', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openFolder(page, 'Tillgänglighet')
    const stored = () => page.evaluate(() => localStorage.getItem('viktkollen.accessibility.preferences.v1'))
    await page.locator('#app-section-more').getByRole('button', { name: /^Läsning/ }).click()
    await page.locator('#app-section-more').getByRole('button', { name: 'Stor text', exact: true }).first().click()
    expect(await stored()).toContain('"textSize":"large"')
    await page.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }).click()
    const reset = page.getByRole('button', { name: 'Återställ tillgänglighetsinställningar' })

    let dialog = await openConfirm(page, reset, 'Återställ tillgänglighetsinställningar', 'Vill du återställa bara tillgänglighetsinställningarna i den här vyn?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-reset-accessibility', { block: moderate, include: '.confirm-dialog' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(reset).toBeFocused()
    expect(await stored()).toContain('"textSize":"large"')

    dialog = await openConfirm(page, reset, 'Återställ tillgänglighetsinställningar', 'Vill du återställa bara tillgänglighetsinställningarna i den här vyn?')
    await confirmWithKeyboard(page, dialog)
    await expect.poll(stored).toBeNull()
    await expect(reset).toBeFocused()
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })
})
