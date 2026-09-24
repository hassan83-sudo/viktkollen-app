import { defineConfig } from '@playwright/test'
import process from 'node:process'

// A11Y-8F: browser accessibility suite (axe, keyboard, zoom/reflow, motion).
// Separate from the release smoke config so product commands are unchanged.
//
// The app runs on the Vite dev server with a local, never-contacted Supabase
// URL. The specs seed a fake signed-in session and abort every Supabase
// request, so no backend, account or paid service is needed.
//
// A11Y_CHROMIUM_EXECUTABLE lets environments with a preinstalled Chromium
// (different revision than the one Playwright pins) use it instead.
const port = Number(process.env.A11Y_E2E_PORT || 5174)
const executablePath = process.env.A11Y_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  expect: {
    timeout: 8000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  retries: 0,
  testDir: './tests/a11y',
  testMatch: '**/*.spec.js',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
      executablePath,
    },
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    trace: 'retain-on-failure',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    env: {
      VITE_SUPABASE_ANON_KEY: 'local-a11y-check',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    },
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    url: `https://127.0.0.1:${port}`,
  },
  projects: [
    {
      name: 'a11y-chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
