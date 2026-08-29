import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import BodyAnalysisVideoScanner from './BodyAnalysisVideoScanner.jsx'

const source = readFileSync(resolve(process.cwd(), 'src/components/BodyAnalysisVideoScanner.jsx'), 'utf8')
const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const serviceSource = readFileSync(resolve(process.cwd(), 'src/services/bodyAnalysisVideoScan.js'), 'utf8')
const cardSource = readFileSync(resolve(process.cwd(), 'src/components/BodyAnalysisCard.jsx'), 'utf8')

describe('BodyAnalysisVideoScanner', () => {
  it('renders a compact idle start screen for video scan', () => {
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
    expect(html).toContain('Kroppsscanning')
    expect(html).toContain('Starta videoscanning')
    expect(html).toContain('Guidat fram')
    expect(html).toContain('Auto')
    expect(html).toContain('Manuell')
    expect(html).toContain('Ansiktsskydd')
    expect(html).toContain('Röstguide')
    expect(html).toContain('Originalvideo sparas inte')
    expect(html).toContain('value="auto"')
    expect(html).toContain('value="cover"')
    expect(html).not.toContain('display: none')
  })

  it('uses a full-frame preview, extracts three frames, and does not keep original video', () => {
    expect(css).toContain('.body-scan-video-frame video')
    expect(css).toMatch(/\.body-scan-video-frame video[\s\S]*object-fit:\s*contain/)
    expect(css).toContain('html.vk-body-scan-session .bottom-nav')
    expect(css).toContain('env(safe-area-inset-top')
    expect(css).toContain('env(safe-area-inset-bottom')
    expect(css).toContain('.body-scan-active-overlay')
    expect(css).not.toContain('.bottom-nav.vk-body-scan-nav-hidden')
    expect(css).toMatch(/\.body-scan-active-overlay \{[\s\S]*inset:\s*0/)
    expect(css).toContain('z-index: 100')
    expect(source).toContain('createPortal')
    expect(source).toContain('vk-body-scan-portal')
    expect(source).toContain('setBodyScanSessionActive')
    expect(css).toMatch(/\.body-scan-video-frame \{[\s\S]*touch-action:\s*manipulation/)
    expect(css).toMatch(/\.body-scan-active-overlay \{[\s\S]*touch-action:\s*manipulation/)
    expect(css).toMatch(/\.body-scan-manual-mask \{[\s\S]*touch-action:\s*none/)
    expect(source).not.toMatch(/setPointerCapture|releasePointerCapture/)
    expect(source).not.toMatch(/setInterval\(updateContainRect/)
    expect(source).not.toMatch(/setInterval\(/)
    expect(source).toMatch(/window\.cancelAnimationFrame\(frameId\)/)
    expect(source).toMatch(/cancelled = true/)
    expect(css).not.toMatch(/html\.vk-body-scan-session,\s*\nhtml\.vk-body-scan-session body/)
    expect(source).toContain('createPinchTracker')
    expect(source).not.toMatch(/MediaRecorder|mediaRecorder/)
    expect(serviceSource).not.toMatch(/MediaRecorder|IndexedDB|indexedDB/)
    expect(source).toContain('drawVideoFrameToCanvas')
    expect(source).toContain('applyFaceProtectionToCanvas')
    expect(source).toContain('toDataURL')
    expect(source).toContain('stopMediaStream')
    expect(source).toContain('cancelVideoScanSpeech')
    expect(source).toContain('← Avbryt')
    expect(source).toContain('Jag står rätt i ramen')
    expect(source).toContain('Ta om vald pose')
    expect(source).toContain('handleFramingMode')
    expect(source).toContain('createPinchTracker')
    expect(source).toContain('defaultBodyScanFacingMode')
    expect(source).toContain('Analyserar kroppen...')
    expect(source).not.toContain('disabled={!canAnalyze || analysisBlocked}')
  })

  it('keeps pose copy facing away from the camera on the back pose', () => {
    expect(serviceSource).toContain('VÄND RYGGEN MOT KAMERAN')
    expect(serviceSource).toContain('Vänd ryggen mot kameran.')
    expect(serviceSource.toLowerCase()).not.toMatch(/vänd mot kameran/)
    expect(source).toContain('Jag står rätt i ramen')
    expect(source).toContain('handleFramingMode')
  })

  it('starts analysis with immediate feedback in the card chain', () => {
    expect(cardSource).toContain("setAnalysisStatus(t('card.status.analyzing'))")
    expect(cardSource).toContain('safeLogger.info')
    expect(cardSource).toContain("t('card.errors.missingFront')")
    expect(cardSource).toContain("t('card.errors.approveFirst')")
    expect(cardSource).toContain("t('card.heading.retry')")
    expect(cardSource).toContain('<BodyScanGuidedCapture')
    // Photo mode is the only working scan mode in this sprint: it stays the
    // default, and selecting the video mode must not mount the camera-driven
    // BodyAnalysisVideoScanner or fabricate a result - it shows an honest
    // "coming in a future update" placeholder instead.
    expect(cardSource).not.toContain('<BodyAnalysisVideoScanner')
    expect(cardSource).toContain("t('card.heading.modeVideoComingSoonTitle')")
    expect(cardSource).toContain("useState('photo')")
    expect(cardSource).toContain("scanMode === 'photo' || hideChrome ? (")
  })

  it('lets Home mount only the guided capture flow, with none of the old card/hub chrome around it', () => {
    // hideChrome must gate the header, hub title, mode switch, privacy
    // summary, onboarding/premium/quality info, unlock card, dev tools,
    // and the result/compare/stats/history sections - Home's fullscreen
    // flow must render nothing but BodyScanGuidedCapture (plus the
    // required consent modal and error feedback for the same button).
    expect(cardSource).toContain('hideChrome = false')
    expect(cardSource).toMatch(/\{!hideChrome && \(\s*<div className="panel-heading">/)
    expect(cardSource).toMatch(/\{!hideChrome && <h3 className="body-scan-hub-title">/)
    expect(cardSource).toMatch(/\{!hideChrome && \(\s*<div className="body-scan-mode-switch"/)
    expect(cardSource).toContain("scanMode === 'photo' || hideChrome ? (")
    expect(cardSource).toMatch(/\{!hideChrome && \(\s*<details className="body-scan-section">/)
    expect(cardSource).toMatch(/\{!hideChrome && \(\s*<>\s*<details className="body-analysis-more-info">/)
    expect(cardSource).toMatch(/\{!hideChrome && \(\s*<>\s*\{!analysisError && savedAnalysis/)
    // The consent modal and error banner stay unconditional - they are the
    // direct, functional consequence of the same Analysera-button press,
    // not decorative header chrome, so hiding them would strand the user.
    const beforeConsent = cardSource.slice(0, cardSource.indexOf('<BodyAnalysisPrivacy'))
    expect(beforeConsent.trimEnd().endsWith('</>)}')).toBe(true)
    const afterConsent = cardSource.slice(cardSource.indexOf('<BodyAnalysisPrivacy'))
    expect(afterConsent.indexOf('{analysisError && (')).toBeGreaterThan(0)
    expect(afterConsent.indexOf('{analysisError && (')).toBeLessThan(200)
    expect(readFileSync(resolve(process.cwd(), 'src/components/BodyAnalysisPrivacy.jsx'), 'utf8')).toContain('body-scan-consent-overlay')
  })
})
