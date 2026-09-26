import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8X5 (8M B13): the five window.confirm calls in WeeklyMealPlanner
// ("Planera dagen" in Mat) are ConfirmDialog
// (docs/accessibility/A11Y_8X5_WEEKLY_MEAL_CONFIRM.md).

const moderate = ['critical', 'serious', 'moderate']

async function openPlanner(page) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /^Mat/ }).first().click()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
  await page.locator('#app-section-more').getByRole('button', { name: 'Planera dagen' }).first().click()
  await expect(page.getByRole('heading', { name: 'Planera måltider' })).toBeVisible()
}

async function planMeal(page, title, ingredients = '') {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Lägg till planerad måltid' }) })
  await form.getByRole('textbox', { name: 'Titel' }).fill(title)
  if (ingredients) await form.getByRole('textbox', { name: 'Ingredienser' }).fill(ingredients)
  await form.getByRole('button', { name: 'Lägg till planerad måltid' }).click()
  await expect(page.locator('.meal-planner-day').getByRole('heading', { name: title })).toBeVisible()
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

const plannedTitles = (page) => page.locator('.meal-planner-day h5').allInnerTexts()
const loggedMeals = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('viktkollen.meals') || '[]').length)

test.describe('confirm dialogs in the meal planner (8M B13)', () => {
  test('remove a planned meal, and "remove from the plan" after registering it', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openPlanner(page)
    await planMeal(page, 'Kycklinggryta')
    await planMeal(page, 'Laxpasta')
    // The day is found by its date, so it is still found once it is empty.
    const date = (await page.locator('.meal-planner-day').filter({ has: page.getByRole('heading', { name: 'Laxpasta' }) }).locator('.meal-planner-day-heading span').innerText()).trim()
    const day = page.locator('.meal-planner-day').filter({ has: page.locator('.meal-planner-day-heading span', { hasText: date }) })
    const dayAdd = day.getByRole('button', { name: 'Lägg till måltid' })

    // Remove: Escape and Avbryt keep it; Tab stays in the dialog.
    const remove = page.getByRole('button', { name: 'Ta bort Kycklinggryta' })
    let dialog = await openConfirm(page, remove, 'Ta bort planerad måltid', 'Vill du ta bort den planerade måltiden?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-remove-planned-meal', { block: moderate, include: '.confirm-dialog' })
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Ta bort' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(remove).toBeFocused()
    dialog = await openConfirm(page, remove, 'Ta bort planerad måltid', 'Vill du ta bort den planerade måltiden?')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(remove).toBeFocused()
    expect((await plannedTitles(page)).sort()).toEqual(['Kycklinggryta', 'Laxpasta'])

    // Confirm: the card is gone; focus goes to the same day's "Lägg till måltid".
    dialog = await openConfirm(page, remove, 'Ta bort planerad måltid', 'Vill du ta bort den planerade måltiden?')
    await confirmWithKeyboard(page, dialog)
    expect(await plannedTitles(page)).toEqual(['Laxpasta'])
    await expect(dayAdd).toBeFocused()
    await expectFocusVisibleNotBody(page)

    // Register: the meal is logged at once; the dialog only asks about the plan.
    const register = day.getByRole('button', { name: 'Registrera som måltid' })
    const before = await loggedMeals(page)
    dialog = await openConfirm(page, register, 'Måltiden registrerades', 'Måltiden registrerades. Vill du ta bort den från planen?')
    expect(await loggedMeals(page)).toBe(before + 1)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(register).toBeFocused()
    expect(await plannedTitles(page)).toEqual(['Laxpasta'])

    dialog = await openConfirm(page, register, 'Måltiden registrerades', 'Måltiden registrerades. Vill du ta bort den från planen?')
    expect(await loggedMeals(page)).toBe(before + 2)
    await confirmWithKeyboard(page, dialog)
    expect(await plannedTitles(page)).toEqual([])
    expect(await loggedMeals(page)).toBe(before + 2)
    await expect(dayAdd).toBeFocused()
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })

  test('copy a day with replace, clear the shopping list and clear the week', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openPlanner(page)
    await planMeal(page, 'Havregrynsgröt', '1 dl havregryn')
    const days = page.locator('.meal-planner-day')
    const sourceDate = (await days.first().locator('.meal-planner-day-heading span').innerText()).trim()
    const targetDate = (await days.nth(1).locator('.meal-planner-day-heading span').innerText()).trim()

    // Copy day, "Ersätt befintliga": asks first.
    await page.getByRole('combobox', { name: 'Från dag' }).selectOption(sourceDate)
    await page.getByRole('combobox', { name: 'Måldag' }).selectOption(targetDate)
    await page.getByRole('combobox', { name: 'Läge' }).selectOption('replace')
    const copy = page.getByRole('button', { name: 'Kopiera dagens plan' })
    let dialog = await openConfirm(page, copy, 'Ersätt måltider', 'Vill du ersätta befintliga måltider på måldagarna?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-copy-replace', { block: moderate, include: '.confirm-dialog' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(copy).toBeFocused()
    await expect(days.nth(1).locator('h5')).toHaveCount(0)
    dialog = await openConfirm(page, copy, 'Ersätt måltider', 'Vill du ersätta befintliga måltider på måldagarna?')
    await confirmWithKeyboard(page, dialog)
    await expect(days.nth(1).locator('h5')).toHaveText(['Havregrynsgröt'])
    await expect(copy).toBeFocused()

    // Shopping list.
    await page.getByRole('button', { name: 'Generera inköpslista' }).click()
    const items = page.locator('#shopping-list-title').locator('xpath=ancestor::section[1]').locator('li')
    await expect(items.first()).toBeVisible()
    const itemCount = await items.count()
    const clearShopping = page.getByRole('button', { name: 'Rensa inköpslista' })
    dialog = await openConfirm(page, clearShopping, 'Rensa inköpslista', 'Vill du rensa vald veckas inköpslista?')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(clearShopping).toBeFocused()
    await expect(items).toHaveCount(itemCount)
    dialog = await openConfirm(page, clearShopping, 'Rensa inköpslista', 'Vill du rensa vald veckas inköpslista?')
    await confirmWithKeyboard(page, dialog)
    await expect(items).toHaveCount(0)
    await expect(clearShopping).toBeFocused()
    await expectFocusVisibleNotBody(page)

    // Clear the week.
    const clearWeek = page.getByRole('button', { name: 'Rensa veckoplan' })
    dialog = await openConfirm(page, clearWeek, 'Rensa veckoplan', 'Vill du rensa vald veckoplan?')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await plannedTitles(page)).toHaveLength(2)
    dialog = await openConfirm(page, clearWeek, 'Rensa veckoplan', 'Vill du rensa vald veckoplan?')
    await confirmWithKeyboard(page, dialog)
    expect(await plannedTitles(page)).toEqual([])
    await expect(clearWeek).toBeFocused()
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })
})
