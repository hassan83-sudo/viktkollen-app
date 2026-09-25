import { expect, test } from '@playwright/test'
import { openApp } from './support/app.js'
import { expectNoBlockingAxeViolations } from './support/axe.js'
import { expectBackgroundInert, expectFocusNotOnBody, leftoverInertCount } from './support/focus.js'

// A11Y-8F: the wake alarm is triggered deterministically with Playwright's
// fake clock. Speech synthesis is a silent stub and vibration a no-op, so the
// test proves the alarm works without any sound.

const modes = {
  default: null,
  'high-contrast': { highContrast: true },
  'large-text-and-controls': { largeControls: true, textSize: 'extra-large' },
}

async function setAlarmWithKeyboard(page) {
  const shortcut = page.getByRole('button', { name: 'Väckarklocka' }).first()
  await shortcut.focus()
  await page.keyboard.press('Enter')
  const time = page.getByLabel('Väckningstid')
  if (!(await time.count())) {
    const bedroom = page.getByRole('button', { name: /^Sovrum/ }).first()
    await bedroom.focus()
    await page.keyboard.press('Enter')
  }
  await time.fill('07:00')
  const setAlarm = page.getByRole('button', { name: 'Sätt väckarklocka' })
  await setAlarm.focus()
  await page.keyboard.press('Enter')
  return setAlarm
}

for (const [modeName, preferences] of Object.entries(modes)) {
  test(`visual wake alarm (${modeName}): shown, focused, modal, not closed by Escape, closed by Enter`, async ({ page }, testInfo) => {
    await openApp(page, { clockAt: new Date('2026-09-24T06:58:30+02:00'), preferences, speech: true })
    const setAlarm = await setAlarmWithKeyboard(page)
    await page.clock.fastForward('02:00')

    const alarm = page.getByRole('alertdialog', { name: 'Väckarklockan ringer' })
    await expect(alarm).toBeVisible()
    await expect(alarm).toHaveAttribute('aria-modal', 'true')
    await expect(alarm.getByText('Larm kl. 07:00')).toBeVisible()
    await expect(alarm.getByText('Dags att vakna.')).toBeVisible()
    const stop = alarm.getByRole('button', { name: 'Stäng av larmet' })
    await expect(stop).toBeFocused()
    await expect(alarm.getByRole('button', { name: 'Snooza 5 min' })).toBeVisible()
    await expectBackgroundInert(page)
    // Not blinking: no keyframe animation or repeating effect in the alarm
    // (a short one-off focus transition is not a blink and is allowed).
    const blinking = await alarm.evaluate((element) => document.getAnimations()
      .filter((animation) => element.contains(animation.effect?.target))
      .filter((animation) => animation instanceof CSSAnimation || animation.effect.getTiming().iterations > 1)
      .map((animation) => animation.animationName || 'repeating effect'))
    expect(blinking).toEqual([])
    await expectNoBlockingAxeViolations(page, testInfo, `alarm-${modeName}`)

    await page.keyboard.press('Escape')
    await expect(alarm).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(alarm).toHaveCount(0)
    expect(await leftoverInertCount(page)).toBe(0)
    await expect(setAlarm).toBeFocused()
    await expectFocusNotOnBody(page)
  })
}
