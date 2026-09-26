import { expect, test } from '@playwright/test'
import { goToSection, openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { inspectFocusedElement, settleFocus } from './support/hiddenFocus.js'

// A11Y-8X4 (8M B13): the window.confirm calls in Mat (MealLogger,
// RecipeManager, MealQuickAdd, DietaryPreferencesPanel) are ConfirmDialog
// (docs/accessibility/A11Y_8X4_FOOD_CONFIRM_GROUP_1.md). The replace
// confirmation on import is covered in remaining-prompts.spec.js.

const moderate = ['critical', 'serious', 'moderate']

async function openMat(page) {
  await openApp(page, { reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  await page.locator('#app-section-more').getByRole('button', { name: /^Mat/ }).first().click()
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

async function logMeal(page, name) {
  await page.locator('#app-section-more').getByRole('button', { name: 'Lägg till måltid' }).first().click()
  await page.locator('form').filter({ has: page.getByRole('button', { name: 'Spara måltid' }) }).getByRole('textbox', { name: 'Namn' }).fill(name)
  const details = page.locator('#app-section-more summary', { hasText: 'Näring och portion' })
  if (!(await page.getByLabel('Kalorier (kcal)').isVisible())) await details.click()
  await page.getByLabel('Kalorier (kcal)').fill('300')
  await page.getByRole('button', { name: 'Spara måltid' }).click()
}

async function openTool(page, name) {
  const tools = page.locator('#app-section-more details', { has: page.locator('summary', { hasText: 'Verktyg' }) })
  if (!(await tools.evaluate((element) => element.open))) await tools.locator('summary').click()
  await page.getByRole('button', { name, exact: true }).click()
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

// Confirm with the keyboard: from Avbryt, Shift+Tab to the action, Enter.
async function confirmWithKeyboard(page, dialog) {
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
}

test.describe('confirm dialogs in Mat (8M B13)', () => {
  test('meal and favourite: Escape and Avbryt keep them, "Ta bort" removes, focus goes to the list heading', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openMat(page)
    await logMeal(page, 'Gröt')
    await logMeal(page, 'Kvarg')
    await page.locator('#app-section-more summary', { hasText: 'Mönster & historik' }).click()
    await page.getByRole('button', { name: 'Öppna historik och veckomönster' }).click()
    const removeGrot = page.getByRole('button', { name: 'Ta bort Gröt' })
    await expect(removeGrot).toBeVisible()
    const meals = () => page.evaluate(() => JSON.parse(localStorage.getItem('viktkollen.meals') || '[]').map((meal) => meal.name).sort())

    let dialog = await openConfirm(page, removeGrot, 'Ta bort måltid', 'Vill du ta bort den här måltiden?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-delete-meal', { block: moderate, include: '.confirm-dialog' })
    // Tab and Shift+Tab stay in the dialog.
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Ta bort' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Avbryt' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(removeGrot).toBeFocused()
    dialog = await openConfirm(page, removeGrot, 'Ta bort måltid', 'Vill du ta bort den här måltiden?')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(removeGrot).toBeFocused()
    expect(await meals()).toEqual(['Gröt', 'Kvarg'])

    dialog = await openConfirm(page, removeGrot, 'Ta bort måltid', 'Vill du ta bort den här måltiden?')
    await confirmWithKeyboard(page, dialog)
    await expect.poll(meals).toEqual(['Kvarg'])
    await expect(page.locator(':focus')).toHaveText('1 träffar')
    await expectFocusVisibleNotBody(page)

    // Favourite.
    await page.getByRole('button', { name: 'Spara Kvarg som favorit' }).click()
    await openTool(page, 'Favoriter')
    const favorites = page.locator('#app-section-more .nutrition-card').filter({ has: page.getByRole('heading', { name: 'Favoritmåltider' }) })
    const removeFavorite = favorites.getByRole('button', { name: 'Ta bort' })
    await expect(removeFavorite).toHaveCount(1)
    dialog = await openConfirm(page, removeFavorite, 'Ta bort favorit', 'Vill du ta bort den här favoriten?')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(removeFavorite).toBeFocused()
    await expect(removeFavorite).toHaveCount(1)
    dialog = await openConfirm(page, removeFavorite, 'Ta bort favorit', 'Vill du ta bort den här favoriten?')
    await confirmWithKeyboard(page, dialog)
    await expect(removeFavorite).toHaveCount(0)
    await expect(page.locator(':focus')).toHaveText('Favoritmåltider')
    await expectFocusVisibleNotBody(page)
    expect(await meals()).toEqual(['Kvarg'])
    expect(native).toEqual([])
  })

  test('nutrition goals and food preferences: clear asks, Avbryt keeps, focus returns to the button', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openMat(page)
    await openTool(page, 'Näringsmål')
    const calories = page.getByLabel('Dagligt kalorimål (kcal)')
    await calories.fill('2000')
    await page.getByRole('button', { name: 'Spara mål' }).click()
    const clearGoals = page.getByRole('button', { name: 'Återställ mål' })

    let dialog = await openConfirm(page, clearGoals, 'Rensa kostmål', 'Vill du rensa alla kostmål?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-clear-goals', { block: moderate, include: '.confirm-dialog' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(clearGoals).toBeFocused()
    await expect(calories).toHaveValue('2000')
    dialog = await openConfirm(page, clearGoals, 'Rensa kostmål', 'Vill du rensa alla kostmål?')
    await confirmWithKeyboard(page, dialog)
    await expect(calories).toHaveValue('')
    await expect(clearGoals).toBeFocused()
    await expectFocusVisibleNotBody(page)

    await openTool(page, 'Import, recension och mer')
    const panel = page.locator('.dietary-preferences-panel')
    const vegetarian = panel.getByRole('button', { name: 'Vegetariskt' })
    await vegetarian.click()
    await panel.getByRole('button', { name: 'Spara', exact: true }).click()
    await expect(vegetarian).toHaveAttribute('aria-pressed', 'true')
    const clear = panel.getByRole('button', { name: 'Rensa', exact: true })
    dialog = await openConfirm(page, clear, 'Rensa matpreferenser', 'Vill du ta bort dina sparade matpreferenser?')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(clear).toBeFocused()
    await expect(vegetarian).toHaveAttribute('aria-pressed', 'true')
    dialog = await openConfirm(page, clear, 'Rensa matpreferenser', 'Vill du ta bort dina sparade matpreferenser?')
    await confirmWithKeyboard(page, dialog)
    await expect(vegetarian).toHaveAttribute('aria-pressed', 'false')
    await expect(panel.getByRole('status')).toHaveText('Matpreferenser rensade.')
    await expect(clear).toBeFocused()
    expect(native).toEqual([])
  })

  test('recipe and template: "Ta bort" / "Radera" remove them, focus goes to the list heading', async ({ page }, testInfo) => {
    const native = watchNativeDialogs(page)
    await openMat(page)
    await page.locator('#app-section-more').getByRole('button', { name: 'Recept', exact: true }).first().click()
    const recipeForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Skapa recept' }) })
    await recipeForm.getByRole('textbox', { name: 'Namn' }).first().fill('Linsgryta')
    await recipeForm.getByRole('textbox', { name: 'Mängd' }).fill('2')
    await recipeForm.getByRole('textbox', { name: 'Namn' }).nth(1).fill('Linser')
    await recipeForm.getByRole('button', { name: 'Skapa recept' }).click()
    const removeRecipe = page.locator('.recipe-browser').getByRole('button', { name: 'Ta bort' })
    await expect(removeRecipe).toHaveCount(1)

    let dialog = await openConfirm(page, removeRecipe, 'Ta bort recept', 'Vill du ta bort receptet?')
    await expectNoBlockingAxeViolations(page, testInfo, 'confirm-delete-recipe', { block: moderate, include: '.confirm-dialog' })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(removeRecipe).toBeFocused()
    await expect(removeRecipe).toHaveCount(1)
    dialog = await openConfirm(page, removeRecipe, 'Ta bort recept', 'Vill du ta bort receptet?')
    await confirmWithKeyboard(page, dialog)
    await expect(removeRecipe).toHaveCount(0)
    await expect(page.locator(':focus')).toHaveText('Dina recept')
    await expectFocusVisibleNotBody(page)

    await page.locator('#app-section-more').getByRole('button', { name: 'Lägg till måltid' }).first().click()
    await page.getByRole('button', { name: 'Ny mall' }).click()
    const templateForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Spara mall' }) })
    await templateForm.getByRole('textbox', { name: 'Namn' }).fill('Frukostgröt')
    await templateForm.getByRole('textbox', { name: 'Måltid' }).fill('Havregrynsgröt med bär')
    await templateForm.getByRole('button', { name: 'Spara mall' }).click()
    const removeTemplate = page.locator('.meal-quick-add').getByRole('button', { name: 'Radera' })
    await expect(removeTemplate).toHaveCount(1)
    dialog = await openConfirm(page, removeTemplate, 'Radera mall', 'Vill du ta bort mallen "Frukostgröt"?')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(removeTemplate).toBeFocused()
    await expect(removeTemplate).toHaveCount(1)
    dialog = await openConfirm(page, removeTemplate, 'Radera mall', 'Vill du ta bort mallen "Frukostgröt"?')
    await confirmWithKeyboard(page, dialog)
    await expect(removeTemplate).toHaveCount(0)
    await expect(page.locator(':focus')).toHaveText('Sparade mallar')
    await expectFocusVisibleNotBody(page)
    expect(native).toEqual([])
  })
})
