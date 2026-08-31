import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The barcode scanner's start/stop/detect logic lives inline in src/App.jsx
// (src/components/BarcodeScanner.jsx is presentation-only and receives
// handlers as props). This is a static source guard: it verifies the
// camera-frame handling functions never reference a network primitive and
// only ever extract the decoded barcode string (rawValue) from the
// detector, never the raw video frame, canvas pixels, or an image/blob of
// the frame itself.
const currentDir = dirname(fileURLToPath(import.meta.url))
const appJsxPath = resolve(currentDir, '../../App.jsx')
const appSource = readFileSync(appJsxPath, 'utf8')

function extractFunctionSource(source, functionName) {
  const startMatch = source.match(new RegExp(`(async function|function)\\s+${functionName}\\s*\\(`))
  if (!startMatch) {
    throw new Error(`Could not locate function ${functionName} in App.jsx`)
  }

  const startIndex = startMatch.index
  const braceStart = source.indexOf('{', startIndex)
  let depth = 0
  let index = braceStart

  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }

  return source.slice(startIndex, index + 1)
}

describe('barcode scanner camera frames stay local', () => {
  it('startBarcodeScanner never calls a network primitive', () => {
    const fnSource = extractFunctionSource(appSource, 'startBarcodeScanner')

    expect(fnSource).not.toMatch(/\bfetch\s*\(/)
    expect(fnSource).not.toMatch(/XMLHttpRequest/)
    expect(fnSource).not.toMatch(/\baxios\b/)
    expect(fnSource).not.toMatch(/navigator\.sendBeacon/)
    expect(fnSource).not.toMatch(/\bWebSocket\b/)
  })

  it('startBarcodeScanner only extracts the decoded rawValue string from the detector, never the frame/canvas itself', () => {
    const fnSource = extractFunctionSource(appSource, 'startBarcodeScanner')

    // The only thing read off a detected barcode is codes[0]?.rawValue -
    // a short decoded text string, never pixel or frame data.
    expect(fnSource).toMatch(/rawValue/)
    expect(fnSource).not.toMatch(/toDataURL/)
    expect(fnSource).not.toMatch(/getImageData/)
    expect(fnSource).not.toMatch(/captureStream/)
    expect(fnSource).not.toMatch(/ImageCapture/)
  })

  it('stopBarcodeScanner only stops local camera tracks and never calls a network primitive', () => {
    const fnSource = extractFunctionSource(appSource, 'stopBarcodeScanner')

    expect(fnSource).toMatch(/getTracks\(\)\.forEach/)
    expect(fnSource).not.toMatch(/\bfetch\s*\(/)
    expect(fnSource).not.toMatch(/XMLHttpRequest/)
  })

  it('the only value persisted from a scan is the decoded barcode string (saveScannedProduct)', () => {
    const fnSource = extractFunctionSource(appSource, 'startBarcodeScanner')
    const savesDecodedStringOnly = /saveScannedProduct\(barcode\)/.test(fnSource)

    expect(savesDecodedStringOnly).toBe(true)
  })
})
