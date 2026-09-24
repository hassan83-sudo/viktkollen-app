import { expect } from '@playwright/test'

// A11Y-8F: opens the real app in a deterministic, offline, signed-in state.
//
// - A fake Supabase session is seeded in localStorage (the project URL is the
//   local, never-started http://127.0.0.1:54321, so its storage key is
//   sb-127-auth-token). Every request to it is aborted, so no backend is
//   contacted and nothing depends on network timing.
// - Accessibility preferences can be preset (the same localStorage key the
//   app uses), so modes are applied from the first paint.
// - Speech synthesis can be replaced by a silent, observable stub.

export const supabaseUrl = 'http://127.0.0.1:54321'
const accessibilityPreferencesKey = 'viktkollen.accessibility.preferences.v1'

function seedSession([sessionJson, preferencesJson, preferencesKey]) {
  window.localStorage.setItem('sb-127-auth-token', sessionJson)
  if (preferencesJson) window.localStorage.setItem(preferencesKey, preferencesJson)
  else window.localStorage.removeItem(preferencesKey)
}

function fakeSession() {
  const now = Math.floor(Date.now() / 1000)
  const user = {
    app_metadata: { provider: 'email' },
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    email: 'a11y@example.test',
    id: '00000000-0000-4000-8000-000000000001',
    role: 'authenticated',
    user_metadata: {},
  }
  return { access_token: 'a11y.test.token', expires_at: now + 360000, expires_in: 360000, refresh_token: 'a11y-refresh', token_type: 'bearer', user }
}

// Silent speech: records what would be spoken and fires the utterance events
// so the UI goes through its real speaking -> done states without audio.
export function silentSpeech() {
  const spoken = []
  let current = null
  const synthesis = {
    cancel() {
      if (current) {
        const utterance = current
        current = null
        utterance.onerror?.({ error: 'interrupted', utterance })
      }
    },
    getVoices: () => [],
    pause() {},
    paused: false,
    pending: false,
    resume() {},
    speak(utterance) {
      spoken.push(utterance.text)
      current = utterance
      setTimeout(() => utterance.onstart?.({ utterance }), 0)
    },
    get speaking() {
      return Boolean(current)
    },
    addEventListener() {},
    removeEventListener() {},
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis })
  window.__a11ySpokenTexts = spoken
  navigator.vibrate = () => true
}

export async function openApp(page, { preferences = null, clockAt = null, speech = false, reducedMotion = null } = {}) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(`${supabaseUrl}/**`, (route) => route.abort())
  await page.addInitScript(seedSession, [JSON.stringify(fakeSession()), preferences ? JSON.stringify(preferences) : null, accessibilityPreferencesKey])
  if (speech) await page.addInitScript(silentSpeech)
  if (clockAt) await page.clock.install({ time: clockAt })
  // page.emulateMedia is used (not the reducedMotion context option) because
  // it also works with preinstalled Chromium revisions that ignore the latter.
  if (reducedMotion) await page.emulateMedia({ reducedMotion })
  await page.goto('/')
  await expect(page.locator('main.app-shell')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#app-section-home h1').first()).toBeVisible()
  return { errors }
}

// A11Y-8G: bottom navigation links are named by their visible label
// (WCAG 2.5.3), so the label is also the accessible name.
export function bottomNavLink(page, label) {
  return page.getByRole('navigation', { name: 'Huvudnavigation' }).getByRole('link', { name: label, exact: true })
}

// Keyboard navigation to a main section via the bottom navigation.
export async function goToSection(page, label, sectionId) {
  const link = bottomNavLink(page, label)
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator(`#app-section-${sectionId}`)).toHaveClass(/is-active/)
}

export async function openAccessibilityFolder(page) {
  await goToSection(page, 'Mer', 'more')
  const folder = page.locator('#app-section-more').getByRole('button', { name: /^Tillgänglighet & hjälpmedel/ })
  await folder.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more').getByRole('heading', { level: 1, name: 'Tillgänglighet & hjälpmedel' })).toBeVisible()
}

export async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}
