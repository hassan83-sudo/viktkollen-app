/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { shouldBuildBodyScanPreview } from '../../../../vite.config.js'
import { getLocalBodyScanStorageKey } from '../localBodyScanStore.js'
import { Blocked, PreviewShell } from './PreviewApp.jsx'
import { isPreviewTestAllowed, isPreviewTestHost, previewTestScope } from './previewGuard.js'

const root = process.cwd()

describe('Preview-testsida för lokal kroppsscanning', () => {
  it('is built only for Vercel Preview or local builds – never for Vercel Production', () => {
    expect(shouldBuildBodyScanPreview({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(shouldBuildBodyScanPreview({ VERCEL: '1', VERCEL_ENV: 'development' })).toBe(false)
    // Fail closed om Vercel saknar VERCEL_ENV.
    expect(shouldBuildBodyScanPreview({ VERCEL: '1' })).toBe(false)
    expect(shouldBuildBodyScanPreview({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(true)
    expect(shouldBuildBodyScanPreview({})).toBe(true)
  })

  it('only runs on localhost or this project\'s Vercel Preview hosts', () => {
    expect(isPreviewTestHost('viktkollen-7yrjxshvc-appsonthego-s-projects.vercel.app')).toBe(true)
    expect(isPreviewTestHost('viktkollen-git-claude-body-scan-local-1-appsonthego-s-projects.vercel.app')).toBe(true)
    expect(isPreviewTestHost('localhost')).toBe(true)
    for (const host of [
      'viktkollen.vercel.app',
      'viktkollen-app.vercel.app',
      'viktkollen-appsonthego-s-projects.vercel.app',
      'viktkollen-7yrjxshvc-appsonthego-s-projects.vercel.app.evil.example',
      'evil-7yrjxshvc-appsonthego-s-projects.vercel.app',
      'example.com',
    ]) {
      expect(isPreviewTestHost(host), host).toBe(false)
    }
    expect(isPreviewTestAllowed({ buildFlag: false, hostname: 'localhost' })).toBe(false)
    expect(isPreviewTestAllowed({ buildFlag: true, hostname: 'viktkollen.vercel.app' })).toBe(false)
  })

  it('uses its own test scope, separate from real users and guests', () => {
    const key = getLocalBodyScanStorageKey(previewTestScope)
    expect(key).toBe('viktkollen.userData.v1.preview-test.localBodyScan.v1')
    expect(key).not.toBe(getLocalBodyScanStorageKey({ storageId: 'guest' }))
  })

  it('renders a test-mode switch and no legacy cleanup or migration', () => {
    const html = renderToStaticMarkup(<PreviewShell />)
    expect(html).toContain('Aktivera testläge')
    expect(html).toContain('Gamla data rensas eller migreras inte här')
    expect(renderToStaticMarkup(<Blocked />)).toContain('Inte tillgänglig')
    const app = readFileSync(resolve(root, 'src/features/body-scan-local/preview/PreviewApp.jsx'), 'utf8')
    expect(app).toContain('showLegacyCleanup={false}')
  })

  it('never imports auth, sync, Supabase or server routes', () => {
    const files = ['previewMain.jsx', 'PreviewApp.jsx', 'previewGuard.js']
      .map((name) => readFileSync(resolve(root, 'src/features/body-scan-local/preview', name), 'utf8'))
    for (const text of files) {
      expect(text).not.toMatch(/supabase|authService|cloudSync|syncQueue|\/api\/|fetch\(|registerServiceWorker|legacyBodyImageCleanup/i)
    }
    const html = readFileSync(resolve(root, 'body-scan-preview.html'), 'utf8')
    expect(html).toContain('noindex')
    expect(html).not.toMatch(/sw\.js|serviceWorker/)
  })
})
