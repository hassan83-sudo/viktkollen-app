import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8X2 (8M B13): the import mode in Mat and Framsteg and the progress
// photo note use named modal forms instead of window.prompt
// (docs/accessibility/A11Y_8X2_REMAINING_PROMPTS.md). In Mat the replace
// confirmation is still window.confirm and is accepted here; in Framsteg it
// is ConfirmDialog since A11Y-8X3.

const moderate = ['critical', 'serious', 'moderate']
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function openFolder(page, name) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

// Records native dialogs: a prompt fails the test, a confirm is accepted.
function watchNativeDialogs(page) {
  const seen = []
  page.on('dialog', async (dialog) => {
    seen.push(dialog.type())
    if (dialog.type() === 'confirm') await dialog.accept()
    else await dialog.dismiss()
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

// Picks the file with the visible button, as a user does; the dialog opens
// once the file is read.
async function chooseFile(page, button, file) {
  const chooser = page.waitForEvent('filechooser')
  await button.focus()
  await page.keyboard.press('Enter')
  await (await chooser).setFiles(file)
  const dialog = page.getByRole('dialog', { name: 'Importera säkerhetskopia' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function expectImportDialog(page, dialog, summary) {
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAccessibleDescription(summary)
  const group = dialog.getByRole('group', { name: 'Hur ska importen läggas in?' })
  const merge = group.getByRole('radio', { name: 'Slå ihop med befintlig data' })
  const replace = group.getByRole('radio', { name: 'Ersätt befintlig data' })
  await expect(merge).toBeChecked()
  await expect(replace).not.toBeChecked()
  await expect(merge).toBeFocused()
  // Tab and Shift+Tab stay in the dialog: radio group, Importera, Avbryt.
  const importButton = dialog.getByRole('button', { name: 'Importera' })
  const cancel = dialog.getByRole('button', { name: 'Avbryt' })
  await page.keyboard.press('Tab')
  await expect(importButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(merge).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(cancel).toBeFocused()
  return { cancel, importButton, merge, replace }
}

test.describe('remaining prompts (8M B13)', () => {
  test('Mat: import mode is a radio group; Escape and Cancel cancel, merge and replace import', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openFolder(page, 'Mat')
    await page.locator('#app-section-more').getByRole('button', { name: 'Lägg till måltid' }).first().click()
    await page.getByRole('textbox', { name: 'Namn' }).fill('Gröt')
    await page.locator('#app-section-more summary', { hasText: 'Näring och portion' }).click()
    await page.getByLabel('Kalorier (kcal)').fill('300')
    await page.getByRole('button', { name: 'Spara måltid' }).click()
    await page.locator('#app-section-more summary', { hasText: 'Verktyg' }).click()
    await page.getByRole('button', { name: 'Import, recension och mer' }).click()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Spara kostdata' }).click()
    const file = await (await download).path()
    const meals = () => page.evaluate(() => JSON.parse(localStorage.getItem('viktkollen.meals') || '[]').length)
    const exported = await meals()
    expect(exported).toBeGreaterThan(0)

    const open = page.getByRole('button', { name: 'Välj säkerhetskopia' })
    const status = page.locator('.nutrition-import-export [role="status"]')
    let dialog = await chooseFile(page, open, file)
    const summary = /^Importen innehåller \d+ måltider, \d+ favoriter, \d+ mallar, \d+ recept och (inga )?kostmål\.$/
    const { replace } = await expectImportDialog(page, dialog, summary)
    await expectNoBlockingAxeViolations(page, testInfo, 'meal-import-dialog', { block: moderate, include: '.form-dialog' })

    // Escape: nothing imported, focus back on the button, status says so.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(open).toBeFocused()
    await expect(status).toHaveText('Import avbröts.')
    expect(await meals()).toBe(exported)

    // Cancel: the same.
    dialog = await chooseFile(page, open, file)
    await dialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(open).toBeFocused()
    expect(await meals()).toBe(exported)

    // Merge (the preselected mode) with Enter: the meals are added.
    dialog = await chooseFile(page, open, file)
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(status).toHaveText('Kostdata importerad.')
    await expect(open).toBeFocused()
    await expectFocusVisibleNotBody(page)
    await expect.poll(meals).toBe(exported * 2)

    // Replace: the choice is selectable with the arrow keys, then confirmed.
    dialog = await chooseFile(page, open, file)
    await page.keyboard.press('ArrowDown')
    await expect(replace).toBeChecked()
    await expect(replace).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(status).toHaveText('Kostdata importerad.')
    await expect.poll(meals).toBe(exported)
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual(['confirm'])
  })

  test('Framsteg: import mode; merge keeps both weights, replace restores the backup', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openFolder(page, 'Framsteg')
    await page.getByRole('button', { name: /^Vikt/ }).click()
    await page.getByRole('textbox', { name: 'Vikt i kg' }).fill('80,4')
    await page.getByRole('button', { name: 'Spara vikt' }).click()
    await page.locator('#app-section-more .progress-hub-back').click()
    await page.getByRole('button', { name: /^Historik & verktyg/ }).click()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportera framstegsdata' }).click()
    const file = await (await download).path()
    const rows = page.locator('#app-section-more .progress-list-card')
    await expect(rows).toHaveCount(1)

    // A second weight after the backup.
    await page.locator('#app-section-more .progress-hub-back').click()
    await page.getByRole('button', { name: /^Vikt/ }).click()
    await page.getByLabel('Datum').first().fill('2026-01-10')
    await page.getByRole('textbox', { name: 'Vikt i kg' }).fill('82')
    await page.getByRole('button', { name: 'Spara vikt' }).click()
    await page.locator('#app-section-more .progress-hub-back').click()
    await page.getByRole('button', { name: /^Historik & verktyg/ }).click()
    await expect(rows).toHaveCount(2)

    const open = page.getByRole('button', { name: 'Importera JSON' })
    let dialog = await chooseFile(page, open, file)
    await expectImportDialog(page, dialog, /^Importen innehåller 1 viktposter, \d+ kroppsmått och \d+ rapporter\.$/)
    await expectNoBlockingAxeViolations(page, testInfo, 'progress-import-dialog', { block: moderate, include: '.form-dialog' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(open).toBeFocused()
    await expect(rows).toHaveCount(2)

    // Merge: both weights stay.
    dialog = await chooseFile(page, open, file)
    await dialog.getByRole('button', { name: 'Importera' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(open).toBeFocused()
    await expect(rows).toHaveCount(2)

    // Replace: back to the backup.
    dialog = await chooseFile(page, open, file)
    await page.keyboard.press('ArrowDown')
    await expect(dialog.getByRole('radio', { name: 'Ersätt befintlig data' })).toBeChecked()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    const confirm = page.getByRole('alertdialog', { name: 'Ersätt framstegsdata' })
    await expect(confirm).toHaveAccessibleDescription('Detta ersätter endast lokal vikt- och framstegsdata. Vill du fortsätta?')
    await expect(confirm.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-replace-import', { block: moderate, include: '.confirm-dialog' })
    // Avbryt: nothing replaced, focus back on the import button.
    await page.keyboard.press('Enter')
    await expect(confirm).toHaveCount(0)
    await expect(open).toBeFocused()
    await expect(page.locator('.progress-card [role="status"]').filter({ hasText: 'Import avbröts.' })).toHaveCount(1)
    await expect(rows).toHaveCount(2)
    // Ersätt.
    await chooseFile(page, open, file)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(confirm).toBeVisible()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(confirm).toHaveCount(0)
    await expect(rows).toHaveCount(1)
    await expect(open).toBeFocused()
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })

  test('Framstegsbilder: the note is edited in a labelled textarea; Escape, Cancel and Save', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openFolder(page, 'Framsteg')
    await page.getByRole('button', { name: /^Framstegsbilder/ }).click()
    await page.getByRole('textbox', { name: 'Anteckning' }).fill('morgon')
    await page.locator('#app-section-more .progress-photo-upload-card input[type="file"]').first().setInputFiles({ buffer: png, mimeType: 'image/png', name: 'front.png' })
    const edit = page.locator('#app-section-more .progress-photo-actions').getByRole('button', { name: 'Redigera' }).first()
    await expect(edit).toBeVisible()

    const openNote = async () => {
      await edit.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: 'Redigera anteckning' })
      await expect(dialog).toBeVisible()
      return dialog
    }
    let dialog = await openNote()
    const field = dialog.getByRole('textbox', { name: 'Anteckning' })
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('morgon')
    await expectNoBlockingAxeViolations(page, testInfo, 'photo-note-dialog', { block: moderate, include: '.form-dialog' })
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Spara' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(field).toBeFocused()

    // Escape and Cancel keep the note.
    await field.fill('ändrad men avbruten')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(edit).toBeFocused()
    await expect(page.locator('#app-section-more')).not.toContainText('ändrad men avbruten')
    dialog = await openNote()
    await expect(field).toHaveValue('morgon')
    await dialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(edit).toBeFocused()

    // Save: the new note is shown, focus back on "Redigera".
    dialog = await openNote()
    await field.fill('kväll, vecka 2')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#app-section-more')).toContainText('kväll, vecka 2')
    await expect(edit).toBeFocused()
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })
})
