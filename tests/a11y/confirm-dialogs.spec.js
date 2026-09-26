import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8X3 (8M B13): the window.confirm calls in ProgressCenter (Framsteg)
// are a named alertdialog (ConfirmDialog) with Avbryt focused first
// (docs/accessibility/A11Y_8X3_CONFIRM_GROUP_1.md). The measurement delete
// lives in the Body Scan folder and is covered in jsdom
// (src/components/a11y/confirmDialog.test.jsx).

const moderate = ['critical', 'serious', 'moderate']

async function openFramsteg(page) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /^Framsteg/ }).first().click()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

async function openProgressFolder(page, name) {
  const back = page.locator('#app-section-more .progress-hub-back')
  if (await back.count()) await back.click()
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
}

async function addWeight(page, date, value) {
  await openProgressFolder(page, 'Vikt')
  await page.getByLabel('Datum').first().fill(date)
  await page.getByRole('textbox', { name: 'Vikt i kg' }).fill(value)
  await page.getByRole('button', { name: 'Spara vikt' }).click()
}

// No native dialog may open.
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

async function openConfirm(page, trigger, name) {
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog', { name })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  // Avbryt first, so an accidental Enter does not confirm.
  await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeFocused()
  return dialog
}

test.describe('confirm dialogs in Framsteg (8M B13)', () => {
  test('weights: remove one and the selected ones; Avbryt, Escape and confirm', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openFramsteg(page)
    await addWeight(page, '2026-01-10', '82')
    await addWeight(page, '2026-01-20', '81')
    await addWeight(page, '2026-02-01', '80')
    await openProgressFolder(page, 'Historik & verktyg')
    const rows = page.locator('#app-section-more .progress-list-card')
    await expect(rows).toHaveCount(3)
    const remove = rows.first().getByRole('button', { name: 'Ta bort' })

    let dialog = await openConfirm(page, remove, 'Ta bort viktpost')
    await expect(dialog).toHaveAccessibleDescription('Vill du ta bort den här viktposten?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-delete-weight', { block: moderate, include: '.confirm-dialog' })
    // Tab and Shift+Tab stay in the dialog: Avbryt, Ta bort.
    const confirm = dialog.getByRole('button', { name: 'Ta bort' })
    const cancel = dialog.getByRole('button', { name: 'Avbryt' })
    await page.keyboard.press('Tab')
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(confirm).toBeFocused()

    // Escape = Avbryt: nothing removed, focus back on the button.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(remove).toBeFocused()
    await expect(rows).toHaveCount(3)
    dialog = await openConfirm(page, remove, 'Ta bort viktpost')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(remove).toBeFocused()
    await expect(rows).toHaveCount(3)

    // Confirm with the keyboard: one row less; the row (and its button) is
    // gone, so focus goes to the history heading, never to <body>.
    dialog = await openConfirm(page, remove, 'Ta bort viktpost')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(rows).toHaveCount(2)
    await expect(page.locator(':focus')).toHaveText('2 träffar')
    await expectFocusVisibleNotBody(page)

    // Selected ones.
    await page.getByRole('button', { name: 'Markera alla synliga' }).click()
    const removeSelected = page.getByRole('button', { name: 'Ta bort markerade' })
    dialog = await openConfirm(page, removeSelected, 'Ta bort markerade viktposter')
    await expect(dialog).toHaveAccessibleDescription('Vill du ta bort 2 markerade viktposter?')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(rows).toHaveCount(0)
    await expect(page.locator(':focus')).toHaveText('0 träffar')
    expect(native).toEqual([])
  })

  test('reports: duplicate asks first, remove one, clear all', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openFramsteg(page)
    await openProgressFolder(page, 'Rapporter & insikter')
    const reports = page.locator('#app-section-more section.progress-card')
      .filter({ has: page.getByRole('heading', { name: 'Vecko- och månadsrapport' }) })
      .locator('.progress-list-card')
    const createWeek = page.getByRole('button', { name: 'Skapa vecka' })
    await createWeek.click()
    await expect(reports).toHaveCount(1)

    // A second week report today asks; Avbryt creates nothing.
    let dialog = await openConfirm(page, createWeek, 'Rapporten finns redan')
    await expect(dialog).toHaveAccessibleDescription('Det finns redan en rapport för denna period idag. Skapa ändå?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-duplicate-report', { block: moderate, include: '.confirm-dialog' })
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(createWeek).toBeFocused()
    await expect(reports).toHaveCount(1)
    // "Skapa ändå" runs once, even on a double click.
    dialog = await openConfirm(page, createWeek, 'Rapporten finns redan')
    await dialog.getByRole('button', { name: 'Skapa ändå' }).dblclick()
    await expect(dialog).toHaveCount(0)
    await expect(reports).toHaveCount(2)
    await page.waitForTimeout(300)
    await expect(reports).toHaveCount(2)

    // Remove one.
    dialog = await openConfirm(page, reports.first().getByRole('button', { name: 'Ta bort' }), 'Ta bort rapport')
    await expect(dialog).toHaveAccessibleDescription('Vill du ta bort rapporten?')
    await page.keyboard.press('Escape')
    await expect(reports).toHaveCount(2)
    await openConfirm(page, reports.first().getByRole('button', { name: 'Ta bort' }), 'Ta bort rapport')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(reports).toHaveCount(1)
    await expect(page.locator(':focus')).toHaveText('Vecko- och månadsrapport')
    await expectFocusVisibleNotBody(page)

    // Clear all: the button becomes disabled, so focus goes to the heading.
    const clear = page.getByRole('button', { name: 'Rensa' }).first()
    dialog = await openConfirm(page, clear, 'Rensa rapporthistorik')
    await expect(dialog).toHaveAccessibleDescription('Vill du rensa all lokal rapporthistorik?')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(reports).toHaveCount(0)
    await expect(page.locator(':focus')).toHaveText('Vecko- och månadsrapport')
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })
})
