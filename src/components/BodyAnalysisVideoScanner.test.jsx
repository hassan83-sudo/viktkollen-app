import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import BodyAnalysisVideoScanner from './BodyAnalysisVideoScanner.jsx'

const source = readFileSync(resolve(process.cwd(), 'src/components/BodyAnalysisVideoScanner.jsx'), 'utf8')
const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const serviceSource = readFileSync(resolve(process.cwd(), 'src/services/bodyAnalysisVideoScan.js'), 'utf8')

describe('BodyAnalysisVideoScanner', () => {
  it('renders guided video scan as the recommended body scan flow', () => {
    const html = renderToStaticMarkup(
      <BodyAnalysisVideoScanner
        canAnalyze={false}
        disabledReason=""
        photos={{}}
        onAnalyze={() => {}}
        onPhotoChange={() => {}}
      />,
    )

    expect(html).toContain('Videoscanning')
    expect(html).toContain('Rekommenderad')
    expect(html).toContain('Starta videoscanning')
    expect(html).toContain('Integritetsskydd')
    expect(html).toContain('Automatisk mask')
    expect(html).toContain('Röstguide')
    expect(html).toContain('Originalvideo sparas inte')
    expect(html).toContain('Ansiktet behövs inte')
    expect(html).toContain('value="auto"')
    expect(html).not.toContain('display: none')
  })

  it('uses a full-frame preview, extracts three frames, and does not keep original video', () => {
    expect(css).toContain('.body-scan-video-frame video')
    expect(css).toMatch(/\.body-scan-video-frame video[\s\S]*object-fit:\s*contain/)
    expect(source).not.toMatch(/MediaRecorder|mediaRecorder/)
    expect(serviceSource).not.toMatch(/MediaRecorder|IndexedDB|indexedDB/)
    expect(source).toContain('drawVideoFrameToCanvas')
    expect(source).toContain('applyFaceProtectionToCanvas')
    expect(source).toContain('toDataURL')
    expect(source).toContain('stopMediaStream')
    expect(source).toContain('cancelVideoScanSpeech')
    expect(source).toContain('Avbryt scanning')
    expect(source).toContain('Ta om pose')
    expect(source).toContain('Ta om hela scanningen')
    expect(source).toContain('Vänd kamera')
    expect(source).toContain('defaultBodyScanFacingMode')
  })
})


describe('BodyAnalysisVideoScanner', () => {
  it('renders guided video scan as the recommended body scan flow', () => {
    const html = renderToStaticMarkup(
      <BodyAnalysisVideoScanner
        canAnalyze={false}
        disabledReason=""
        photos={{}}
        onAnalyze={() => {}}
        onPhotoChange={() => {}}
      />,
    )

    expect(html).toContain('Videoscanning')
    expect(html).toContain('Rekommenderad')
    expect(html).toContain('Starta videoscanning')
    expect(html).toContain('Integritetsskydd')
    expect(html).toContain('Automatisk mask')
    expect(html).toContain('Röstguide')
    expect(html).toContain('Originalvideo sparas inte')
    expect(html).toContain('Ansiktet behövs inte')
    expect(html).not.toContain('display: none')
  })
})
