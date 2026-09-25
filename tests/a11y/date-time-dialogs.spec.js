import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8X1 (8M B13): the date and time for "Kopiera" and "Lägg till idag"
// in Mat (MealLogger) and "Kopiera" in the weight history (ProgressCenter)
// come from a named modal with date and time fields, not window.prompt
// (docs/accessibility/A11Y_8X1_DATE_TIME_DIALOGS.md).

const moderate = ['critical', 'serious', 'moderate']
const invalidDate = 'Ange ett giltigt datum (ÅÅÅÅ-MM-DD).'

async function openFolder(page, name) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

// window.prompt must never be called in these flows.
async function failOnPrompt(page) {
  const prompts = []
  page.on('dialog', async (dialog) => {
    prompts.push(`${dialog.type()}: ${dialog.message()}`)
    await dialog.dismiss()
  })
  return prompts
}

async function logMeal(page, name) {
  await openFolder(page, 'Mat')
  await page.locator('#app-section-more').getByRole('button', { name: 'Lägg till måltid' }).first().click()
  await page.getByRole('textbox', { name: 'Namn' }).fill(name)
  await page.locator('#app-section-more summary', { hasText: 'Näring och portion' }).click()
  await page.getByLabel('Kalorier (kcal)').fill('300')
  await page.getByRole('button', { name: 'Spara måltid' }).click()
  await page.locator('#app-section-more summary', { hasText: 'Mönster & historik' }).click()
  await page.getByRole('button', { name: 'Öppna historik och veckomönster' }).click()
  const copy = page.getByRole('button', { name: `Kopiera ${name}` })
  await expect(copy).toBeVisible()
  return copy
}

async function openWithKeyboard(page, trigger) {
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

async function expectFocusVisibleNotBody(page) {
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await settleFocus(page)
  const focused = await page.evaluate(inspectFocusedElement)
  expect(focused.body, 'focus on <body>').toBeUndefined()
  expect(focused.problems, focused.name).toEqual([])
}

test.describe('date and time dialogs (8M B13)', () => {
  test('Mat, "Kopiera": named dialog, labels, initial values, invalid, Escape, Cancel and save', async ({ page }, testInfo) => {
    const prompts = await failOnPrompt(page)
    const copy = await logMeal(page, 'Havregrynsgröt')
    const historyCount = await page.getByRole('button', { name: 'Kopiera Havregrynsgröt' }).count()

    // Open: named modal, focus in the date field, today's date and a time.
    let dialog = await openWithKeyboard(page, copy)
    await expect(dialog).toHaveAccessibleName('Kopiera Havregrynsgröt')
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toHaveAccessibleDescription('Datum anges som ÅÅÅÅ-MM-DD och tid som TT:MM.')
    const date = dialog.getByLabel('Datum')
    const time = dialog.getByLabel('Tid')
    await expect(date).toBeFocused()
    await expect(date).toHaveAttribute('type', 'date')
    await expect(time).toHaveAttribute('type', 'time')
    await expect(date).toHaveValue(/^\d{4}-\d{2}-\d{2}$/)
    await expect(time).toHaveValue(/^\d{2}:\d{2}$/)
    await expectNoBlockingAxeViolations(page, testInfo, 'meal-copy-dialog', { block: moderate, include: '.date-time-dialog' })

    // Tab and Shift+Tab stay in the dialog. (Chromium also stops on the
    // segments of the native date and time fields.)
    const save = dialog.getByRole('button', { name: 'Kopiera' })
    const cancel = dialog.getByRole('button', { name: 'Avbryt' })
    const seen = []
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab')
      seen.push(await page.evaluate(() => (document.activeElement.closest('.date-time-dialog') ? document.activeElement.textContent || document.activeElement.type : 'OUTSIDE')))
    }
    expect(seen).not.toContain('OUTSIDE')
    expect(seen).toEqual(expect.arrayContaining(['time', 'Kopiera', 'Avbryt', 'date']))
    await save.focus()
    await page.keyboard.press('Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(date).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(cancel).toBeFocused()

    // Escape closes without saving; focus goes back to the trigger.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(copy).toBeFocused()
    await expectFocusVisibleNotBody(page)

    // Empty date: not saved, one status message, the field is invalid and
    // described; focus stays on "Kopiera". A correction clears it.
    dialog = await openWithKeyboard(page, copy)
    await date.fill('')
    await save.focus()
    await page.keyboard.press('Enter')
    const status = dialog.getByRole('status')
    await expect(status).toHaveText(invalidDate)
    await expect(save).toBeFocused()
    await expect(date).toHaveAttribute('aria-invalid', 'true')
    await expect(date).toHaveAccessibleDescription(invalidDate)
    expect(await page.evaluate((text) => [...document.querySelectorAll('[role=status], [role=alert], [aria-live]')].filter((element) => element.textContent.includes(text)).length, invalidDate)).toBe(1)
    await expectNoBlockingAxeViolations(page, testInfo, 'meal-copy-dialog-invalid', { block: moderate, include: '.date-time-dialog' })
    await date.fill('2026-09-01')
    await expect(status).toHaveText('')
    await expect(date).not.toHaveAttribute('aria-invalid', 'true')

    // Cancel closes without saving.
    await cancel.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(copy).toBeFocused()
    await expect(page.getByRole('button', { name: 'Kopiera Havregrynsgröt' })).toHaveCount(historyCount)

    // Valid save with Enter in the time field: the copy is added and focus
    // returns to the trigger.
    dialog = await openWithKeyboard(page, copy)
    await time.fill('08:15')
    await time.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator(':focus')).toHaveAccessibleName('Kopiera Havregrynsgröt')
    await expectFocusVisibleNotBody(page)
    await expect.poll(() => page.getByRole('button', { name: 'Kopiera Havregrynsgröt' }).count()).toBeGreaterThan(historyCount)
    expect(prompts).toEqual([])
  })

  test('Mat, favourite "Lägg till idag": same dialog, saves and restores focus', async ({ page }, testInfo) => {
    const prompts = await failOnPrompt(page)
    await logMeal(page, 'Kvarg')
    await page.getByRole('button', { name: 'Spara Kvarg som favorit' }).click()
    await page.locator('#app-section-more summary', { hasText: 'Verktyg' }).click()
    await page.getByRole('button', { name: 'Favoriter', exact: true }).click()
    const add = page.getByRole('button', { name: 'Lägg till idag' }).first()
    await expect(add).toBeVisible()
    const storedKvarg = () => page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('viktkollen.meals') || '[]').filter((meal) => meal?.name === 'Kvarg').length
      } catch {
        return -1
      }
    })
    const copies = await storedKvarg()
    expect(copies).toBeGreaterThan(0)

    const dialog = await openWithKeyboard(page, add)
    await expect(dialog).toHaveAccessibleName('Lägg till Kvarg')
    await expect(dialog.getByLabel('Datum')).toBeFocused()
    await expectNoBlockingAxeViolations(page, testInfo, 'favorite-dialog', { block: moderate, include: '.date-time-dialog' })
    await dialog.getByRole('button', { name: 'Lägg till' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(add).toBeFocused()
    await expect.poll(storedKvarg).toBe(copies + 1)
    expect(prompts).toEqual([])
  })

  test('Framsteg, weight "Kopiera": initial values from the entry, invalid, Escape and save', async ({ page }, testInfo) => {
    const prompts = await failOnPrompt(page)
    await openFolder(page, 'Framsteg')
    await page.getByRole('button', { name: /^Vikt/ }).click()
    await page.getByRole('textbox', { name: 'Vikt i kg' }).fill('80,4')
    const entryDate = await page.getByLabel('Datum').first().inputValue()
    await page.getByRole('button', { name: 'Spara vikt' }).click()
    await page.locator('#app-section-more .progress-hub-back').click()
    await page.getByRole('button', { name: /^Historik & verktyg/ }).click()
    const copy = page.locator('#app-section-more .progress-actions').getByRole('button', { name: 'Kopiera' }).first()
    await expect(copy).toBeVisible()
    const rows = await page.locator('#app-section-more .progress-actions').count()

    let dialog = await openWithKeyboard(page, copy)
    await expect(dialog).toHaveAccessibleName(`Kopiera vikten 80,4 kg från ${entryDate}`)
    const date = dialog.getByLabel('Datum')
    const time = dialog.getByLabel('Tid')
    await expect(date).toBeFocused()
    await expect(date).toHaveValue(entryDate)
    // The entry's own time (a daily weight is stored at its saved time).
    await expect(time).toHaveValue(/^\d{2}:\d{2}$/)
    await expectNoBlockingAxeViolations(page, testInfo, 'weight-copy-dialog', { block: moderate, include: '.date-time-dialog' })

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(copy).toBeFocused()

    dialog = await openWithKeyboard(page, copy)
    await time.fill('')
    await time.press('Enter')
    await expect(dialog.getByRole('status')).toHaveText('Ange en giltig tid (TT:MM).')
    await expect(time).toHaveAttribute('aria-invalid', 'true')
    await expect(time).toBeFocused()
    await time.fill('06:45')
    await date.fill('2026-01-15')
    await time.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(copy).toBeFocused()
    await expectFocusVisibleNotBody(page)
    await expect.poll(() => page.locator('#app-section-more .progress-actions').count()).toBe(rows + 1)
    expect(prompts).toEqual([])
  })
})
