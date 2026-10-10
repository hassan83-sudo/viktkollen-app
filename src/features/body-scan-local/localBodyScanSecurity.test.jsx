/** @vitest-environment jsdom */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import BodyAnalysisCard from '../../components/BodyAnalysisCard.jsx'
import { FEATURE_FLAGS_STORAGE_KEY, defaultFeatureFlags } from '../featureRegistry.js'
import { localPoseModel } from './localBodyScanConfig.js'
import { isSameOriginAssetUrl, localModelAssetUrls } from './localPoseModel.js'

const root = process.cwd()
const featureDir = resolve(root, 'src/features/body-scan-local')

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : sourceFiles(path)
    return /\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
}

afterEach(() => window.localStorage.clear())

describe('Lokal kroppsscanning – säkerhet', () => {
  it('has no code path that uploads, encodes or persists images', () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /sendBeacon/,
      /WebSocket/,
      /\/api\//,
      /toDataURL/,
      /toBlob/,
      /createObjectURL/,
      /FileReader/,
      /indexedDB/,
      /sessionStorage/,
      /caches\./,
      /console\.(log|info|warn|error)/,
      /analyzeBodyWithAI|bodyAnalysisService/,
      /openai/i,
    ]
    const files = sourceFiles(featureDir)
    expect(files.length).toBeGreaterThanOrEqual(6)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const pattern of forbidden) {
        expect(`${file}: ${pattern.test(text)}`).toBe(`${file}: false`)
      }
    }
  })

  it('loads model and WASM only from the app itself', () => {
    for (const url of Object.values(localModelAssetUrls)) {
      expect(isSameOriginAssetUrl(url, 'https://viktkollen.example')).toBe(true)
    }
    expect(isSameOriginAssetUrl('https://cdn.jsdelivr.net/npm/x.wasm', 'https://viktkollen.example')).toBe(false)
    expect(isSameOriginAssetUrl('//storage.googleapis.com/x.task', 'https://viktkollen.example')).toBe(false)
  })

  it('pins a MediaPipe version without the built-in telemetry sender', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@mediapipe/tasks-vision']).toBe(localPoseModel.libraryVersion)
    const bundle = readFileSync(resolve(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'), 'utf8')
    expect(bundle).not.toContain('odml.pa.googleapis.com')
    expect(localPoseModel.license).toBe('Apache-2.0')
  })

  it('is off by default and leaves the existing body camera unchanged', () => {
    expect(defaultFeatureFlags.localBodyScan).toBe(false)
    const off = renderToStaticMarkup(<BodyAnalysisCard />)
    expect(off).not.toContain('Lokal (beta)')
    expect(off).toContain('aria-pressed="true"')

    window.localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify({ localBodyScan: true }))
    const on = renderToStaticMarkup(<BodyAnalysisCard />)
    expect(on).toContain('Lokal (beta)')
    // Fotoläget är fortfarande förvalt även när flaggan är på.
    const localButton = '<button aria-pressed="false" class="secondary-button" type="button">Lokal (beta)</button>'
    expect(on).toContain(localButton)
    expect(on.replace(localButton, '')).toBe(off)
  })
})
