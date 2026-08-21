import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  getNutritionAnalysisBlocker,
  getNutritionImagePayloadSnapshot,
  shouldIgnoreEmptyNutritionImageSelection,
} from '../services/nutritionScannerFlow.js'
import NutritionScannerV2 from './NutritionScannerV2.jsx'

describe('NutritionScannerV2', () => {
  it('renders safe scanner flow and privacy text', () => {
    const markup = renderToStaticMarkup(
      <NutritionScannerV2
        analysisDate="2026-07-31"
        meals={[]}
        onMealsChange={() => {}}
        selectedMealDate="2026-07-31"
      />,
    )

    expect(markup).toContain('Skanna mat')
    expect(markup).toContain('Ta eller välj en tydlig bild av måltiden.')
    expect(markup).toContain('Ta bild')
    expect(markup).toContain('Välj bild')
    expect(markup).toContain('Analysera maten')
    expect(markup).toContain('AI-analys fungerar inte?')
    expect(markup).toContain('Jag godk')
    expect(markup).toContain('class="scanner-file-picker-group"')
    expect(markup).toContain('for="nutrition-scanner-photo-library-input"')
    expect(markup).toContain('id="nutrition-scanner-photo-library-input"')
    expect(markup).toContain('aria-label="Välj en matbild från bildbiblioteket"')
    expect(markup).toContain('class="photo-input scanner-file-picker scanner-camera-control"')
    expect(markup).toContain('class="scanner-camera-native-input"')
    expect(markup).toContain('id="nutrition-scanner-photo-camera-input"')
    expect(markup).toContain('aria-label="Ta en ny matbild med kameran"')
    expect(markup).toContain('accept="image/*"')
    expect(markup).toContain('capture="environment"')
    expect(markup).toMatch(/id="nutrition-scanner-photo-library-input"[^>]*type="file"[^>]*accept="image\/\*"(?:(?!capture=)[^>])*\/>/)
    expect(markup).toMatch(/id="nutrition-scanner-photo-camera-input"[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/)
    expect(markup).toContain('class="checkbox-row scanner-consent-row"')
    expect(markup).toContain('for="nutrition-scanner-remote-consent"')
    expect(markup).toContain('id="nutrition-scanner-remote-consent"')
    expect(markup).not.toContain('id="nutrition-scanner-remote-consent" disabled=""')
    expect(markup).toContain('HTTP-LAN')
    expect(markup).not.toContain('Remote analys skickar')
    expect(markup).not.toMatch(/\b(undefined|null|NaN|Infinity)\b|\[object Object\]|base64|data:image/)
  })

  it('allows selected image local analysis clicks without consent or remote provider', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: { size: 1 }, imageMetadata: {} },
      isAnalyzing: false,
      isOnline: true,
      providerType: 'local',
      remoteConsent: false,
    })).toBe('')
  })

  it('allows selected image remote analysis clicks when consent and network are ready', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: { size: 1 }, imageMetadata: {} },
      isAnalyzing: false,
      isOnline: true,
      providerType: 'remote',
      remoteConsent: true,
    })).toBe('')
  })

  it('surfaces missing consent instead of leaving remote click silent', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: { size: 1 }, imageMetadata: {} },
      isAnalyzing: false,
      isOnline: true,
      providerType: 'remote',
      remoteConsent: false,
    })).toContain('Bekräfta först')
  })

  it('surfaces missing image and in-flight analysis blockers', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: null,
      isAnalyzing: false,
      isOnline: true,
      providerType: 'local',
      remoteConsent: false,
    })).toContain('Välj eller ta en bild')

    expect(getNutritionAnalysisBlocker({
      imagePayload: { imageMetadata: {} },
      isAnalyzing: false,
      isOnline: true,
      providerType: 'local',
      remoteConsent: false,
    })).toContain('Välj eller ta en bild')

    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: { size: 1 }, imageMetadata: {} },
      isAnalyzing: true,
      isOnline: true,
      providerType: 'local',
      remoteConsent: false,
    })).toContain('körs redan')
  })

  it('keeps local analysis independent from the remote provider chunk', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain('cameraInputRef')
    expect(source).toContain('clearImageInputValue(cameraInputRef.current)')
    expect(source).toContain('function handleCameraInputClick(event)')
    expect(source).toContain('setPreviewUrl(result.previewUrl)')
    expect(source).toContain('setImagePayloadState({')
    expect(source).toContain("onClick={(event) => handleAnalysisAction('local', event)}")
    expect(source).not.toContain("onTouchEnd={(event) => handleAnalysisAction('local', event)}")
    expect(source).toContain('handleAnalysisAction')
    expect(source).toContain('createLocalNutritionPhotoEstimate')
    expect(source).toContain("providerType: 'local'")
    expect(source).toContain('scheduleResultScroll')
    expect(source).toContain('scrollIntoView')
    expect(source).toContain('providerBadgeLabel')
    expect(source).toContain('getNutritionPhotoFoodDisplayName')
    expect(source).toContain('getNutritionPhotoPortionDisplayName')
    expect(source).toContain('Lokal grov uppskattning att granska')
    expect(source).toContain('scanner-review-hero')
    expect(source).toContain('Analyserar måltiden')
    expect(source).toContain('Identifierar maten')
    expect(source).toContain('Uppskattar portioner')
    expect(source).toContain('Beräknar näring')
    expect(source).toContain('Bildens innehåll har inte AI-tolkats')
    expect(source).toContain('Identifierade komponenter')
    expect(source).toContain('nutrition-component-list')
    expect(source).toContain('scanner-component-card')
    expect(source).toContain('componentPortionLabel')
  })

  it('keeps scanner review labels Swedish without changing internal enums', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain("high: 'Hög'")
    expect(source).toContain("medium: 'Medel'")
    expect(source).toContain("low: 'Låg'")
    expect(source).toContain("usable: 'Användbar'")
    expect(source).toContain("poor: 'Dålig'")
    expect(source).toContain("good: 'Bra'")
    expect(source).toContain("fried: 'Friterad/stekt'")
    expect(source).toContain("raw: 'Rå'")
    expect(source).toContain("fat: 'Fettkälla'")
    expect(source).toContain('confidenceLabel(analysis.confidence.level)')
    expect(source).toContain('imageQualityLabel(analysis.imageQuality)')
    expect(source).toContain('component.cookingMethods.map(cookingMethodLabel)')
    expect(source).toContain("providerType === 'remote'")
    expect(source).toContain("providerType: 'local'")
  })

  it('presents alternatives as variant uncertainty instead of contradicting confidence', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain('componentSummaryLine')
    expect(source).toContain('Exakt typ behöver granskas')
    expect(source).toContain('Exakt typ osäker')
    expect(source).toContain('getConcreteComponentUncertainties')
    expect(source).toContain('isGenericUncertaintyText')
    expect(source).toContain('!isGenericUncertaintyText(component.uncertainty.reason)')
    expect(source).toContain('Portionsmängden är uppskattad')
    expect(source).toContain('getNutritionPhotoDisplayText(analysis.safeSummary)')
    expect(source).not.toContain('Osäkerhet finns.')
    expect(source).not.toContain('Confidence:')
  })

  it('shows database status buckets including AI estimates in review text', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain('buildPhotoIngredientMatchStatusCounts')
    expect(source).toContain('AI-estimat')
    expect(source).toContain('manuella/databas')
    expect(source).toContain('Totalt {ingredientMatchStatusCounts.total}')
  })

  it('keeps remote consent as a click-time validation rather than a dead disabled button', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain('getNutritionAnalysisBlocker')
    expect(source).toContain("onClick={(event) => handleAnalysisAction('remote', event)}")
    expect(source).not.toContain("onTouchEnd={(event) => handleAnalysisAction('remote', event)}")
    expect(source).toContain('disabled={!hasActiveImagePayload || isAnalyzing || !isOnline}')
  })

  it('renders persistent remote consent management text', () => {
    const markup = renderToStaticMarkup(
      <NutritionScannerV2
        analysisDate="2026-07-31"
        meals={[]}
        onMealsChange={() => {}}
        selectedMealDate="2026-07-31"
        userId="user-a"
      />,
    )

    expect(markup).toContain('Jag godk')
    expect(markup).toContain('nutrition-scanner-remote-consent')
  })

  it('renders safe remote debug details in dev/test mode', () => {
    const markup = renderToStaticMarkup(
      <NutritionScannerV2
        analysisDate="2026-07-31"
        initialRemoteDebug={{
          apiErrorCode: 'AUTH_REQUIRED',
          apiErrorMessage: 'Logga in igen för att använda remote bildanalys.',
          abortSource: 'clientTimeout',
          authPresent: false,
          clientTimeoutMs: 60000,
          clientAttemptId: 'photo-attempt-test',
          consentPresent: true,
          fallbackReason: 'AUTH_REQUIRED',
          fallbackUsed: false,
          providerAttempted: false,
          providerSucceeded: false,
          requestedMode: 'remote',
          requestStarted: false,
          responseContentType: 'application/json; charset=utf-8',
          responseStatus: 401,
        }}
        meals={[]}
        onMealsChange={() => {}}
        selectedMealDate="2026-07-31"
      />,
    )

    expect(markup).toContain('Remote debug')
    expect(markup).toContain('requestedMode')
    expect(markup).toContain('remote')
    expect(markup).toContain('authPresent')
    expect(markup).toContain('no')
    expect(markup).toContain('analysisInputPresent')
    expect(markup).toContain('imageSelected')
    expect(markup).toContain('previewPresent')
    expect(markup).toContain('processedImagePresent')
    expect(markup).toContain('responseStatus')
    expect(markup).toContain('401')
    expect(markup).toContain('clientAttemptId')
    expect(markup).toContain('photo-attempt-test')
    expect(markup).toContain('abortSource')
    expect(markup).toContain('clientTimeout')
    expect(markup).toContain('clientTimeoutMs')
    expect(markup).toContain('60000')
    expect(markup).toContain('providerAttempted')
    expect(markup).toContain('providerSucceeded')
    expect(markup).toContain('fallbackUsed')
    expect(markup).not.toMatch(/Bearer|OPENAI_API_KEY|Authorization|data:image|base64|photo-access-token/)
  })

  it('keeps ingredient editing fields and database provenance available in compact cards', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')
    const editorBody = source.slice(
      source.indexOf('function IngredientEditor'),
      source.indexOf('function NutritionScannerV2', source.indexOf('function IngredientEditor')),
    )

    expect(editorBody).toContain('scanner-ingredient-edit-item')
    expect(editorBody).toContain('<details>')
    expect(editorBody).toContain('Ingrediens')
    expect(editorBody).toContain('Mängd')
    expect(editorBody).toContain('Enhet')
    expect(editorBody).toContain('calories')
    expect(editorBody).toContain('protein')
    expect(editorBody).toContain('carbohydrates')
    expect(editorBody).toContain('fat')
    expect(editorBody).toContain('Osäker')
    expect(editorBody).toContain('Använd matdatabas')
    expect(editorBody).toContain('dataSourceLabel(item.dataSource)')
    expect(editorBody).toContain('Välj manuellt')
    expect(editorBody).toContain('Ta bort')
  })

  it('keeps native image picker controls separate from analysis touch handlers', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')
    const cameraInputClickBody = source.slice(
      source.indexOf('function handleCameraInputClick(event)'),
      source.indexOf('function handleCameraInputEvent(event)', source.indexOf('function handleCameraInputClick(event)')),
    )
    const pickerBlock = source.slice(
      source.indexOf('<div className="scanner-file-picker-group"'),
      source.indexOf('{fileName && <p>Vald bild:', source.indexOf('<div className="scanner-file-picker-group"')),
    )
    const consentStatusBlock = source.slice(
      source.indexOf('<div className="scanner-consent-row scanner-consent-status">'),
      source.indexOf('</div>', source.indexOf('<div className="scanner-consent-row scanner-consent-status">')) + 6,
    )

    expect(pickerBlock).toContain('htmlFor="nutrition-scanner-photo-library-input"')
    expect(pickerBlock).toContain('id="nutrition-scanner-photo-library-input"')
    expect(pickerBlock).toContain('className="photo-input scanner-file-picker scanner-camera-control"')
    expect(pickerBlock).toContain('className="scanner-camera-native-input"')
    expect(pickerBlock).toContain('id="nutrition-scanner-photo-camera-input"')
    expect(pickerBlock).toContain('capture="environment"')
    expect(pickerBlock).toContain('onClick={handleCameraInputClick}')
    expect(pickerBlock).toContain('onInput={handleCameraInputEvent}')
    expect(pickerBlock).toContain('onChange={handleCameraFileChange}')
    expect(pickerBlock).toContain('onClick={(event) => { event.currentTarget.value = \'\' }}')
    expect(pickerBlock).not.toContain('onTouchEnd')
    expect(pickerBlock).not.toContain('preventDefault')
    expect(pickerBlock).not.toContain('stopPropagation')
    expect(cameraInputClickBody).toContain('const input = event.currentTarget')
    expect(cameraInputClickBody).toContain("input.value = ''")
    expect(cameraInputClickBody).not.toMatch(/\.click\(|setTimeout|Promise|await|handleAnalysisAction|lastAnalysisActionRef/)
    expect(consentStatusBlock).toContain('Du har tidigare godkänt att bilden får analyseras med AI.')
    expect(consentStatusBlock).toContain('Återkalla samtycke')
  })

  it('uses a canonical image payload snapshot for analysis validation', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')
    const rawReadinessMatches = source.match(/imagePayloadRef\.current \|\| imagePayload/g) || []
    const handlerBody = source.slice(
      source.indexOf('function handleAnalysisAction(providerType, event)'),
      source.indexOf('function clearAnalysisReviewState()', source.indexOf('function handleAnalysisAction(providerType, event)')),
    )

    expect(source).toContain('const imagePayloadRef = useRef(null)')
    expect(source).toContain('getNutritionImagePayloadSnapshot')
    expect(source).toContain('const resolveActiveImagePayload = () => getNutritionImagePayloadSnapshot(')
    expect(source).toContain("async function analyzeImage(providerType = 'local', imagePayloadSnapshot = null)")
    expect(source).toContain('const activeImagePayload = imagePayloadSnapshot || resolveActiveImagePayload()')
    expect(source).toContain('return analyzeImage(providerType, activeImagePayload)')
    expect(source).toContain('const activeImagePayload = resolveActiveImagePayload()')
    expect(source).toContain('const hasActiveImagePayload = Boolean(resolveActiveImagePayload())')
    expect(source).toContain('disabled={!hasActiveImagePayload || isAnalyzing}')
    expect(source).toContain('clearImageState()')
    expect(source).toContain('updateRemoteDebug({')
    expect(source).toContain('...imageDebugState')
    expect(rawReadinessMatches).toHaveLength(1)
    expect(handlerBody).toContain('const activeImagePayload = resolveActiveImagePayload()')
    expect(handlerBody).toContain('return analyzeImage(providerType, activeImagePayload)')
    expect(handlerBody).not.toContain('preventDefault')
    expect(handlerBody).not.toContain('stopPropagation')
  })

  it('resolves ref-first and state-first image timing to the same analysis payload', () => {
    const refFirstPayload = {
      imageMetadata: { dimensions: '1200x900', fileType: 'image/jpeg' },
      processedBlob: { size: 1234, type: 'image/jpeg' },
      previewUrl: 'blob:state-preview',
    }
    const cameraRefPayload = {
      metadata: { dimensions: '900x1200', fileType: 'image/jpeg' },
      processedBlob: { size: 4321, type: 'image/jpeg' },
      previewUrl: 'blob:camera-preview',
    }

    expect(getNutritionImagePayloadSnapshot(refFirstPayload, null)).toMatchObject({
      imageMetadata: refFirstPayload.imageMetadata,
      processedBlob: refFirstPayload.processedBlob,
      previewUrl: 'blob:state-preview',
    })

    expect(getNutritionImagePayloadSnapshot(null, cameraRefPayload)).toMatchObject({
      imageMetadata: cameraRefPayload.metadata,
      processedBlob: cameraRefPayload.processedBlob,
      previewUrl: 'blob:camera-preview',
    })

    expect(getNutritionImagePayloadSnapshot({ imageMetadata: { dimensions: 'stale' } }, cameraRefPayload)).toMatchObject({
      imageMetadata: cameraRefPayload.metadata,
      processedBlob: cameraRefPayload.processedBlob,
      previewUrl: 'blob:camera-preview',
    })
  })

  it('keeps snapshot fields atomic instead of mixing payload and current image ref', () => {
    const stalePayload = {
      imageMetadata: { dimensions: '111x111', source: 'payload' },
      processedBlob: { size: 111, source: 'payload' },
      previewUrl: 'blob:payload-preview',
    }
    const currentImage = {
      metadata: { dimensions: '222x222', source: 'current-ref' },
      processedBlob: { size: 222, source: 'current-ref' },
      previewUrl: 'blob:current-preview',
    }
    const snapshot = getNutritionImagePayloadSnapshot(stalePayload, currentImage)

    expect(snapshot).toEqual({
      imageMetadata: currentImage.metadata,
      processedBlob: currentImage.processedBlob,
      previewUrl: 'blob:current-preview',
    })
  })

  it('ignores empty iOS file events when a valid canonical image already exists', () => {
    const existingPayload = getNutritionImagePayloadSnapshot({
      imageMetadata: { dimensions: '1200x900' },
      processedBlob: { size: 1234 },
      previewUrl: 'blob:existing',
    })

    expect(shouldIgnoreEmptyNutritionImageSelection(undefined, existingPayload)).toBe(true)
    expect(getNutritionAnalysisBlocker({
      imagePayload: existingPayload,
      isAnalyzing: false,
      isOnline: true,
      providerType: 'remote',
      remoteConsent: true,
    })).toBe('')
  })

  it('does not ignore a first empty image selection when no canonical image exists', () => {
    expect(shouldIgnoreEmptyNutritionImageSelection(undefined, null)).toBe(false)
  })

  it('remote blocker passes when canonical payload has a processed image after file or camera selection', () => {
    const fileSelectionPayload = getNutritionImagePayloadSnapshot({
      imageMetadata: { dimensions: '1200x900' },
      processedBlob: { size: 1234 },
      previewUrl: 'blob:file-selection',
    })
    const cameraSelectionPayload = getNutritionImagePayloadSnapshot(null, {
      metadata: { dimensions: '900x1200' },
      processedBlob: { size: 4321 },
      previewUrl: 'blob:camera-selection',
    })

    for (const payload of [fileSelectionPayload, cameraSelectionPayload]) {
      expect(getNutritionAnalysisBlocker({
        imagePayload: payload,
        isAnalyzing: false,
        isOnline: true,
        providerType: 'remote',
        remoteConsent: true,
      })).toBe('')
    }
  })

  it('cleared canonical payload blocks remote analysis again', () => {
    expect(getNutritionImagePayloadSnapshot(null, null)).toBeNull()
    expect(getNutritionAnalysisBlocker({
      imagePayload: getNutritionImagePayloadSnapshot(null, null),
      isAnalyzing: false,
      isOnline: true,
      providerType: 'remote',
      remoteConsent: true,
    })).toContain('Välj eller ta en bild')
  })

  it('keeps input reset separate from image state reset', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain('function clearImageInputValue(input)')
    expect(source).toContain('function clearImageInputs()')
    expect(source).toContain('clearImageInputs()')
    expect(source).toContain('if (event?.currentTarget) clearImageInputValue(event.currentTarget)')
    expect(source).toContain('shouldIgnoreEmptyNutritionImageSelection(file, resolveActiveImagePayload())')
  })

  it('clears stale review results before starting a new accepted analysis', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')
    const analyzeBody = source.slice(source.indexOf("async function analyzeImage(providerType = 'local', imagePayloadSnapshot = null)"))
    const blockerReturn = analyzeBody.indexOf('if (blocker)')
    const clearReviewState = analyzeBody.indexOf('clearAnalysisReviewState()', blockerReturn)
    const loading = analyzeBody.indexOf('setIsAnalyzing(true)', blockerReturn)
    const localEstimate = analyzeBody.indexOf('createLocalNutritionPhotoEstimate', blockerReturn)

    expect(source).toContain('function clearAnalysisReviewState()')
    expect(source).toContain('setAnalysis(null)')
    expect(source).toContain('setReviewDraft(null)')
    expect(clearReviewState).toBeGreaterThan(blockerReturn)
    expect(clearReviewState).toBeLessThan(loading)
    expect(clearReviewState).toBeLessThan(localEstimate)
  })

  it('clears stale local review when an explicit remote attempt is blocked', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')
    const analyzeBody = source.slice(source.indexOf("async function analyzeImage(providerType = 'local', imagePayloadSnapshot = null)"))
    const blockerBranch = analyzeBody.slice(
      analyzeBody.indexOf('if (blocker)'),
      analyzeBody.indexOf('let controller = null'),
    )

    expect(blockerBranch).toContain("if (providerType === 'remote')")
    expect(blockerBranch).toContain('clearAnalysisReviewState()')
    expect(blockerBranch).toContain("setError(blocker)")
    expect(blockerBranch).toContain("setStatus('')")
  })

  it('rejects non-remote results from the remote analysis button', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')
    const analyzeBody = source.slice(source.indexOf("async function analyzeImage(providerType = 'local', imagePayloadSnapshot = null)"))

    expect(analyzeBody).toContain("const finalProviderType = result.analysis.provider?.type || result.providerType || ''")
    expect(analyzeBody).toContain("if (providerType === 'remote' && finalProviderType !== 'remote')")
    expect(analyzeBody).toContain('Ingen lokal uppskattning visas automatiskt')
  })

  it('keeps dev diagnostics safe and mode-specific around remote requests', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain("logAnalysisDiagnostic('button-handler-entered'")
    expect(source).toContain('photoReady: Boolean(activeImagePayload)')
    expect(source).toContain("logAnalysisDiagnostic('remote-provider-before-call'")
    expect(source).toContain("logAnalysisDiagnostic('remote-provider-after-call'")
    expect(source).toContain('requestedMode')
    expect(source).toContain('fallbackUsed: false')
    expect(source).not.toContain('onTouchEnd=')
    expect(source).not.toMatch(/authorizationHeader|access_token|refresh_token/)
  })

  it('uses a synchronous in-flight ref lock to block duplicate remote attempts', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')
    const analyzeBody = source.slice(source.indexOf("async function analyzeImage(providerType = 'local', imagePayloadSnapshot = null)"))
    const lockCheck = analyzeBody.indexOf('if (analysisInFlightRef.current)')
    const lockSet = analyzeBody.indexOf('analysisInFlightRef.current = true')
    const blocker = analyzeBody.indexOf('const blocker = getNutritionAnalysisBlocker')
    const providerImport = analyzeBody.indexOf("await import('../services/nutritionPhotoAnalysisProvider.js')")
    const blockerRelease = analyzeBody.indexOf('analysisInFlightRef.current = false', analyzeBody.indexOf('if (blocker)'))
    const finallyRelease = analyzeBody.lastIndexOf('analysisInFlightRef.current = false')

    expect(source).toContain('const analysisInFlightRef = useRef(false)')
    expect(source).toContain('duplicateAttemptBlocked: true')
    expect(lockCheck).toBeGreaterThanOrEqual(0)
    expect(lockSet).toBeGreaterThan(lockCheck)
    expect(lockSet).toBeLessThan(blocker)
    expect(lockSet).toBeLessThan(providerImport)
    expect(blockerRelease).toBeGreaterThan(blocker)
    expect(finallyRelease).toBeGreaterThan(providerImport)
  })

  it('releases the in-flight lock on explicit image cleanup', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')
    const clearBody = source.slice(
      source.indexOf('function clearImageState(clearInputs = false)'),
      source.indexOf('function clearImageInputValue(input)'),
    )

    expect(clearBody).toContain("activeAnalysisControllerRef.current?.abort('explicitAbort')")
    expect(clearBody).toContain('analysisInFlightRef.current = false')
  })

  it('marks component cleanup and superseded analysis abort sources', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain("activeAnalysisControllerRef.current?.abort('componentCleanup')")
    expect(source).toContain("activeAnalysisControllerRef.current?.abort('supersededRequest')")
  })

  it('keeps scanner touch targets and consent text mobile-safe in CSS', () => {
    const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.scanner-file-picker,\s*\.body-scan-file-picker\s*\{[\s\S]*overflow:\s*hidden;/)
    expect(css).toMatch(/\.scanner-file-picker input\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*3;/)
    expect(css).toMatch(/\.scanner-file-picker-input\s*\{[\s\S]*position:\s*absolute;[\s\S]*z-index:\s*3;/)
    expect(css).toMatch(/\.nutrition-scanner-v2 \.scanner-camera-control\s*\{[\s\S]*position:\s*relative;[\s\S]*cursor:\s*pointer;/)
    expect(css).toMatch(/\.nutrition-scanner-v2 \.scanner-camera-control input\.scanner-camera-native-input\s*\{[\s\S]*inset:\s*0;[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*z-index:\s*4;/)
    expect(css).toMatch(/\.scanner-actions\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*2;/)
    expect(css).toMatch(/\.nutrition-scanner-v2 \.scanner-file-picker-group\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/)
    expect(css).toMatch(/\.scanner-consent-row\s*\{[\s\S]*grid-template-columns:\s*30px minmax\(10rem, 1fr\);/)
    expect(css).toMatch(/\.scanner-consent-row span\s*\{[\s\S]*white-space:\s*normal;[\s\S]*word-break:\s*normal;[\s\S]*writing-mode:\s*horizontal-tb;/)
    expect(css).toMatch(/\.nutrition-scanner-v2 \.scanner-consent-status\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*cursor:\s*default;/)
    expect(css).toMatch(/\.nutrition-scanner-v2 \.scanner-consent-status \.estimate-note\s*\{[\s\S]*word-break:\s*normal;[\s\S]*writing-mode:\s*horizontal-tb;/)
    expect(css).toMatch(/@media \(max-width:\s*420px\)\s*\{[\s\S]*\.nutrition-scanner-v2 \.scanner-file-picker-group,[\s\S]*\.nutrition-scanner-v2 \.scanner-consent-status\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/)
    expect(css).toMatch(/\.scanner-review-summary\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.2fr\) minmax\(220px, 0\.8fr\);/)
    expect(css).toMatch(/\.nutrition-scanner-review\s*\{[\s\S]*padding-bottom:\s*calc\(var\(--vk-nav-height\) \+ env\(safe-area-inset-bottom\) \+ 112px\);[\s\S]*scroll-margin-bottom:/)
    expect(css).toMatch(/\.scanner-component-card summary,[\s\S]*\.scanner-ingredient-edit-item summary\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(7rem, auto\);/)
    expect(css).toMatch(/@media \(max-width:\s*420px\)\s*\{[\s\S]*\.scanner-review-summary,[\s\S]*\.scanner-ingredient-edit-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/)
  })
})
