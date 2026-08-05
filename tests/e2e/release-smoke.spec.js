import { expect, test } from '@playwright/test'

function attachRuntimeGuards(page, failures) {
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' && !/^Failed to load resource:/i.test(text)) {
      failures.push(`console error: ${text}`)
    }
    if (/React warning|Failed to load module script|preload/i.test(text)) {
      failures.push(`console warning: ${text}`)
    }
  })
  page.on('pageerror', (error) => failures.push(`page error: ${error.message}`))
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.startsWith('http://127.0.0.1:4173')) {
      failures.push(`request failed: ${url} ${request.failure()?.errorText || ''}`)
    }
  })
  page.on('response', (response) => {
    const url = response.url()
    if (url.endsWith('/api/ai') && response.status() === 404) return
    if (url.startsWith('http://127.0.0.1:4173') && response.status() >= 400) {
      failures.push(`http ${response.status()}: ${url}`)
    }
  })
}

async function expectReleaseHealthy(page, failures) {
  await expect(page.locator('#root')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/\b(?:NaN|undefined|null|\[object Object\])\b/)
  expect(failures).toEqual([])
}

async function waitForServiceWorker(page) {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return true
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
      setTimeout(resolve, 3000)
    })
    return Boolean(navigator.serviceWorker.controller)
  })
}

async function waitForCachedAppAssets(page) {
  await expect.poll(async () => page.evaluate(async () => {
    if (!('caches' in window)) return false

    const cacheNames = await caches.keys()
    const assetCacheName = cacheNames.find((name) => name.includes('assets'))

    if (!assetCacheName) return false

    const cache = await caches.open(assetCacheName)
    const cachedRequests = await cache.keys()
    const cachedUrls = cachedRequests.map((request) => request.url)

    return cachedUrls.some((url) => url.includes('/assets/index-')) &&
      cachedUrls.some((url) => url.includes('/assets/react-vendor-'))
  }), {
    timeout: 8000,
  }).toBe(true)
}

test.describe('release candidate smoke', () => {
  test('starts cleanly on desktop without console/runtime errors', async ({ page }) => {
    const failures = []
    attachRuntimeGuards(page, failures)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expectReleaseHealthy(page, failures)
    await expect(page).toHaveTitle(/viktkollen/i)
  })

  test('auth entry points render and registration toggle is reachable', async ({ page }) => {
    const failures = []
    attachRuntimeGuards(page, failures)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const registerButton = page.getByRole('button', { name: /registrera/i })
    if (await registerButton.isVisible().catch(() => false)) {
      await registerButton.click()
      await expect(page.getByRole('button', { name: /skapa konto/i })).toBeVisible()
      await page.getByRole('button', { name: /^logga in$/i }).first().click()
      await expect(page.getByRole('button', { name: /^logga in$/i }).first()).toBeVisible()
    } else {
      await expect(page.getByText(/Viktkollen|AI Coach|Översikt/i).first()).toBeVisible()
    }

    await expectReleaseHealthy(page, failures)
  })

  test('core app surfaces are reachable after local onboarding when auth is not blocking', async ({ page }) => {
    const failures = []
    attachRuntimeGuards(page, failures)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    if (await page.getByText(/Skapa din profil/i).isVisible().catch(() => false)) {
      await page.getByLabel(/Namn/i).fill('Release Test')
      await page.getByLabel(/Startvikt/i).fill('91,8')
      await page.getByLabel(/Målvikt/i).fill('78')
      await page.getByRole('button', { name: /spara|kom igång|skapa/i }).first().click()
    }

    if (await page.getByText(/Logga in/i).first().isVisible().catch(() => false)) {
      await expectReleaseHealthy(page, failures)
      return
    }

    await expect(page.getByText(/AI Coach|Fråga AI-coachen/i).first()).toBeVisible()
    await expect(page.getByText(/Reminder Center|Dagliga påminnelser/i).first()).toBeVisible()
    await expect(page.getByText(/Mål & vanor|Veckofokus/i).first()).toBeVisible()
    await expectReleaseHealthy(page, failures)
  })

  test('lazy feature centers are reachable after local onboarding', async ({ page }) => {
    const failures = []
    attachRuntimeGuards(page, failures)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    if (await page.getByText(/Skapa din profil/i).isVisible().catch(() => false)) {
      await page.getByLabel(/Namn/i).fill('Release Test')
      await page.getByLabel(/Startvikt/i).fill('91,8')
      await page.getByLabel(/MÃ¥lvikt/i).fill('78')
      await page.getByRole('button', { name: /spara|kom igÃ¥ng|skapa/i }).first().click()
    }

    if (await page.getByText(/Logga in/i).first().isVisible().catch(() => false)) {
      await expectReleaseHealthy(page, failures)
      return
    }

    await expect(page.getByText(/Dataexport/i).first()).toBeVisible()
    await expect(page.getByText(/Data Import|Import/i).first()).toBeVisible()
    await expect(page.getByText(/Sync Health|Sync health/i).first()).toBeVisible()
    await expect(page.getByText(/Insights & consistency|Insights/i).first()).toBeVisible()
    await expect(page.getByText(/Coach Plan Center/i).first()).toBeVisible()
    await expect(page.getByText(/Smart Goals & Achievements V2/i).first()).toBeVisible()
    await expect(page.getByText(/Social & Accountability V1/i).first()).toBeVisible()
    await expect(page.getByText(/Notification Center|Notifieringar/i).first()).toBeVisible()
    await expect(page.getByText(/Cloud Backup|Backup/i).first()).toBeVisible()
    await expectReleaseHealthy(page, failures)
  })

  test('adaptive coach memory review opens without unsafe runtime output', async ({ page }) => {
    const failures = []
    attachRuntimeGuards(page, failures)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    if (await page.getByText(/Skapa din profil/i).isVisible().catch(() => false)) {
      await page.getByLabel(/Namn/i).fill('Release Test')
      await page.getByLabel(/Startvikt/i).fill('91,8')
      await page.getByLabel(/MÃ¥lvikt|MÃƒÂ¥lvikt/i).fill('78')
      await page.getByRole('button', { name: /spara|kom igÃ¥ng|kom igÃƒÂ¥ng|skapa/i }).first().click()
    }

    if (await page.getByText(/Logga in/i).first().isVisible().catch(() => false)) {
      await expectReleaseHealthy(page, failures)
      return
    }

    await expect(page.getByRole('heading', { name: /Adaptiv coachning/i })).toBeVisible()
    await page.getByRole('button', { name: /Granska coachminne/i }).click()
    await expect(page.getByRole('heading', { name: /Vad coachen kommer ihÃ¥g|Vad coachen kommer ihåg/i })).toBeVisible()
    await expect(page.getByLabel(/Coachstil/i)).toHaveValue('neutral')
    await page.getByLabel(/Actionstorlek/i).selectOption('liten')
    await page.getByRole('button', { name: /SlÃ¥ pÃ¥ personlig anpassning|Slå på personlig anpassning/i }).click()
    await expect(page.getByText(/AI-kontext som kan skickas/i)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: /Vad coachen kommer ihÃ¥g|Vad coachen kommer ihåg/i })).toBeHidden()
    await expectReleaseHealthy(page, failures)
  })

  test('offline reload keeps the PWA app shell available after first visit', async ({ page, context }) => {
    const failures = []
    attachRuntimeGuards(page, failures)

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(waitForServiceWorker(page)).resolves.toBe(true)
    await page.reload({ waitUntil: 'networkidle' })
    await waitForCachedAppAssets(page)
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.locator('body')).toContainText(/Viktkollen|Logga in|Skapa din profil|Kontrollerar inloggning/i)
    expect(failures.filter((entry) => !/net::ERR_INTERNET_DISCONNECTED/i.test(entry))).toEqual([])
    await context.setOffline(false)
  })
})
