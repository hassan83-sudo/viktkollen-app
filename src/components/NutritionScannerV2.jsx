import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  commitPhotoAnalysisMeal,
  createPhotoAnalysisReviewDraft,
  detectPhotoMealDuplicate,
  validatePhotoAnalysisReviewDraft,
} from '../services/nutritionPhotoAnalysis.js'
import {
  preprocessNutritionPhoto,
  revokeNutritionPhotoObjectUrl,
  validateNutritionPhotoFile,
} from '../services/nutritionPhotoPreprocessing.js'
import {
  createAnalysisController,
  getNutritionImagePayloadSnapshot,
  getNutritionAnalysisBlocker,
  shouldIgnoreEmptyNutritionImageSelection,
} from '../services/nutritionScannerFlow.js'
import { createLocalNutritionPhotoEstimate } from '../services/nutritionPhotoLocalAnalysis.js'
import {
  grantNutritionRemoteConsent,
  readNutritionRemoteConsent,
  revokeNutritionRemoteConsent,
} from '../services/nutritionRemoteConsent.js'
import {
  applyPhotoIngredientDatabaseSuggestion,
  buildPhotoIngredientMatchSummary,
  buildPhotoIngredientMatchStatusCounts,
} from '../services/nutritionPhotoIngredientMatching.js'
import {
  getNutritionPhotoDisplayText,
  getNutritionPhotoFoodDisplayName,
  getNutritionPhotoPortionDisplayName,
} from '../services/nutritionPhotoDisplay.js'
import { getCurrentTimeString, getTodayDateString, mealTypes } from '../services/nutritionService.js'
import { safeLogger } from '../services/safeLogger.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function numericPatch(value) {
  return value === '' ? '' : Number(value)
}

function dataSourceLabel(source) {
  return {
    aiEstimate: 'AI-uppskattning',
    barcode: 'Streckkod',
    databaseDerived: 'Databasberäknat',
    manual: 'Manuellt värde',
    nutritionDatabase: 'Matdatabas',
  }[source] || 'AI-uppskattning'
}

function providerBadgeLabel(type) {
  return type === 'remote' ? 'AI-analys' : 'Lokal grov uppskattning'
}

function confidenceLabel(level) {
  return {
    high: 'Hög',
    insufficient: 'Otillräcklig',
    low: 'Låg',
    medium: 'Medel',
  }[level] || 'Låg'
}

function imageQualityLabel(level) {
  return {
    excellent: 'Mycket bra',
    good: 'Bra',
    poor: 'Dålig',
    screen: 'Skärmbild',
    usable: 'Användbar',
  }[level] || confidenceLabel(level)
}

function cookingMethodLabel(method) {
  return {
    baked: 'Ugnsbakad',
    boiled: 'Kokt',
    breaded: 'Panerad',
    fried: 'Friterad/stekt',
    grilled: 'Grillad',
    raw: 'Rå',
    roasted: 'Rostad',
    steamed: 'Ångkokt',
  }[method] || method
}

function componentCategoryLabel(category) {
  return {
    carbohydrate: 'Kolhydrat',
    fat: 'Fettkälla',
    protein: 'Protein',
    sauce: 'Sås/dressing',
    unknown: 'Okänd',
    vegetables: 'Grönsaker',
  }[category] || 'Komponent'
}

function macroLabel(field) {
  return {
    calories: 'kcal',
    carbsG: 'kolh.',
    fatG: 'fett',
    fiberG: 'fiber',
    proteinG: 'protein',
  }[field] || field
}

function nutritionRangeLabel(range, unit) {
  if (!range) return 'Saknas'
  const decimals = unit === 'kcal' ? 0 : 1
  return `${Number(range.min).toFixed(decimals)}-${Number(range.max).toFixed(decimals)} ${unit}`
}

function nutritionMidpointLabel(value, unit) {
  if (!Number.isFinite(Number(value))) return 'Saknas'
  const decimals = unit === 'kcal' ? 0 : 1
  return `${Number(value).toFixed(decimals)} ${unit}`
}

function componentSummaryLine(component = {}) {
  const category = componentCategoryLabel(component.category)
  const confidence = confidenceLabel(component.confidence)
  const alternatives = safeArray(component.alternatives)
  const reason = String(component.uncertainty?.reason || '').trim()
  const portionConfidence = component.portionEstimate?.confidence
  if (alternatives.length) {
    return `${confidence} säkerhet: ${category.toLocaleLowerCase('sv-SE')}. Exakt typ behöver granskas.`
  }
  if (reason && !isGenericUncertaintyText(reason)) {
    return `${confidence} säkerhet: ${category.toLocaleLowerCase('sv-SE')}. ${reason}`
  }
  if (['low', 'insufficient'].includes(portionConfidence)) {
    return `${confidence} säkerhet: ${category.toLocaleLowerCase('sv-SE')}. Portionsmängden är uppskattad.`
  }
  return `${confidence} säkerhet: ${category.toLocaleLowerCase('sv-SE')}.`
}

function componentNutritionSummary(component = {}) {
  const nutrition = component.nutritionEstimate || {}
  return ['calories', 'proteinG', 'carbsG', 'fatG']
    .map((field) => {
      const unit = field === 'calories' ? 'kcal' : 'g'
      const range = nutrition[field]
      return range ? `${macroLabel(field)} ${nutritionRangeLabel(range, unit)}` : ''
    })
    .filter(Boolean)
    .join(' · ')
}

function debugValueLabel(value) {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  if (value === null || value === undefined || value === '') return '-'
  return String(value).slice(0, 160)
}

function createScannerRemoteDebug(overrides = {}) {
  return {
    apiErrorCode: '',
    apiErrorMessage: '',
    authPresent: '',
    clientAttemptId: '',
    consentPresent: false,
    duplicateAttemptBlocked: false,
    fallbackReason: '',
    fallbackUsed: false,
    finalProviderType: '',
    normalizationSucceeded: false,
    analysisInputPresent: false,
    imageSelected: false,
    previewPresent: false,
    processedImagePresent: false,
    providerAttempted: false,
    providerSucceeded: false,
    requestedMode: 'remote',
    requestStarted: false,
    requestUrl: '/api/nutrition-photo-analysis',
    responseContentType: '',
    responseOk: false,
    responseStatus: '',
    ...overrides,
  }
}

function createScannerImageDebugState(payload = null) {
  return {
    analysisInputPresent: Boolean(payload?.processedBlob),
    imageSelected: Boolean(payload?.imageMetadata || payload?.previewUrl),
    previewPresent: Boolean(payload?.previewUrl),
    processedImagePresent: Boolean(payload?.processedBlob),
  }
}

function portionRangeLabel(portion) {
  if (!portion) return 'Okänd portion'
  const grams = portion.gramsMin !== null && portion.gramsMax !== null
    ? `, ca ${portion.gramsMin}-${portion.gramsMax} g`
    : ''

  return `${getNutritionPhotoPortionDisplayName(portion.description)}${grams}`
}

function componentPortionLabel(component) {
  const portion = component?.portionEstimate
  if (!portion || portion.gramsMin === null || portion.gramsMax === null) return 'Mängd osäker'
  const midpoint = Math.round((portion.gramsMin + portion.gramsMax) / 2)

  return `ca ${midpoint} g (${portion.gramsMin}-${portion.gramsMax} g)`
}

function isGenericUncertaintyText(value = '') {
  return /komponenten kan vara osäker|component may be uncertain|kan vara osäker/i.test(String(value || ''))
}

function getConcreteComponentUncertainties(component = {}) {
  const displayName = getNutritionPhotoFoodDisplayName(component.name)
  const items = []
  const alternatives = safeArray(component.alternatives).map(getNutritionPhotoFoodDisplayName)
  const confidence = String(component.confidence || '')
  const reason = String(component.uncertainty?.reason || '').trim()
  const portionConfidence = component.portionEstimate?.confidence

  if (alternatives.length) {
    items.push(`${displayName}: exakt typ osäker (${alternatives.join(', ')}).`)
  }
  if (reason && !isGenericUncertaintyText(reason)) {
    items.push(`${displayName}: ${reason}`)
  }
  if (['low', 'insufficient'].includes(confidence)) {
    items.push(`${displayName}: låg säkerhet i identifieringen.`)
  }
  if (confidence === 'medium' && !alternatives.length && !reason) {
    items.push(`${displayName}: medelhög säkerhet, granska visuellt.`)
  }
  if (['low', 'insufficient'].includes(portionConfidence)) {
    items.push(`${displayName}: portionsstorleken är en uppskattning.`)
  }
  if (component.category === 'sauce' && !alternatives.length && !reason) {
    items.push(`${displayName}: exakt typ behöver granskas.`)
  }

  return items
}

function calculateIngredientTotals(items = []) {
  return safeArray(items)
    .filter((item) => item.selected !== false)
    .reduce((totals, item) => ({
      calories: Number((totals.calories + (Number(item.calories) || 0)).toFixed(1)),
      carbs: Number((totals.carbs + (Number(item.carbohydrates) || 0)).toFixed(1)),
      fat: Number((totals.fat + (Number(item.fat) || 0)).toFixed(1)),
      protein: Number((totals.protein + (Number(item.protein) || 0)).toFixed(1)),
    }), { calories: 0, carbs: 0, fat: 0, protein: 0 })
}

function IngredientEditor({ disabled, item, match, onApplySuggestion, onChange, onRemove }) {
  return (
    <li className="scanner-ingredient-edit-item">
      <details>
        <summary>
          <span>
            <strong>{getNutritionPhotoFoodDisplayName(item.name)}</strong>
            <small>{item.estimatedAmount || 'Mängd osäker'} {item.unit || 'g'} · {confidenceLabel(item.confidence)} säkerhet</small>
          </span>
          <span>{dataSourceLabel(item.dataSource)}</span>
        </summary>
        <div className="scanner-ingredient-edit-grid">
          <label>
            <span>Ingrediens</span>
            <input
              disabled={disabled}
              value={item.name}
              onChange={(event) => onChange(item.id, { name: event.target.value, userEdited: true })}
            />
          </label>
          <label>
            <span>Mängd</span>
            <input
              disabled={disabled}
              inputMode="decimal"
              value={item.estimatedAmount ?? ''}
              onChange={(event) => onChange(item.id, { estimatedAmount: numericPatch(event.target.value), userEdited: true })}
            />
          </label>
          <label>
            <span>Enhet</span>
            <input
              disabled={disabled}
              value={item.unit}
              onChange={(event) => onChange(item.id, { unit: event.target.value, userEdited: true })}
            />
          </label>
          {['calories', 'protein', 'carbohydrates', 'fat'].map((field) => (
            <label key={field}>
              <span>{field === 'calories' ? 'kcal' : field === 'carbohydrates' ? 'kolhydrater' : field === 'fat' ? 'fett' : field}</span>
              <input
                disabled={disabled}
                inputMode="decimal"
                value={item[field] ?? ''}
                onChange={(event) => onChange(item.id, { [field]: numericPatch(event.target.value), userEdited: true })}
              />
            </label>
          ))}
          <label>
            <span>Osäker</span>
            <input
              checked={item.uncertain === true}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => onChange(item.id, { uncertain: event.target.checked, userEdited: true })}
            />
          </label>
        </div>
        <p className="estimate-note">Datakälla: {dataSourceLabel(item.dataSource)}. Ursprunglig säkerhet: {confidenceLabel(item.confidence)}.</p>
        {match?.status === 'exactMatch' || match?.status === 'normalizedMatch' ? (
          <button disabled={disabled || item.userEdited} type="button" onClick={() => onApplySuggestion(item.id, match.matchedFood)}>
            Använd matdatabas: {match.matchedFood.name}
          </button>
        ) : null}
        {match?.status === 'multipleMatches' && (
          <small>Flera möjliga databasförslag finns. Välj manuellt så AI-estimatet inte ersätts fel.</small>
        )}
        {match?.status === 'noMatch' && (
          <small>Ingen säker databasmatchning hittades. AI-estimatet behålls tills du ändrar det.</small>
        )}
        <button disabled={disabled} type="button" onClick={() => onRemove(item.id)}>Ta bort</button>
      </details>
    </li>
  )
}

const scannerAnalysisStages = ['Identifierar maten', 'Uppskattar portioner', 'Beräknar näring']

function ScannerAnalyzingStatus() {
  const [stage, setStage] = useState(scannerAnalysisStages[0])

  useEffect(() => {
    let index = 0
    const timer = window.setInterval(() => {
      index = Math.min(index + 1, scannerAnalysisStages.length - 1)
      setStage(scannerAnalysisStages[index])
    }, 1600)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="scanner-analyzing-state" role="status">
      <p><strong>Analyserar måltiden…</strong></p>
      <p className="estimate-note">{stage}</p>
    </div>
  )
}

function NutritionScannerV2({
  analysisDate,
  initialRemoteDebug = null,
  meals = [],
  onClose,
  onMealSaved,
  onMealsChange,
  selectedMealDate,
  userId = 'local-user',
}) {
  const headingRef = useRef(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const reviewRef = useRef(null)
  const currentImageRef = useRef(null)
  const imagePayloadRef = useRef(null)
  const activeAnalysisControllerRef = useRef(null)
  const analysisInFlightRef = useRef(false)
  const lastAnalysisActionRef = useRef(0)
  const [status, setStatus] = useState('Välj eller ta en matbild för att börja.')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [imagePayload, setImagePayload] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [reviewDraft, setReviewDraft] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedMealId, setSavedMealId] = useState('')
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [remoteDebug, setRemoteDebug] = useState(() => import.meta.env.DEV && initialRemoteDebug
    ? createScannerRemoteDebug(initialRemoteDebug)
    : null)
  const [remoteConsentDraft, setRemoteConsentDraft] = useState({ checked: false, userId })
  const [storedRemoteConsent, setStoredRemoteConsent] = useState(() => ({
    consent: readNutritionRemoteConsent(userId),
    userId,
  }))
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  const canUseLiveCamera = typeof window !== 'undefined' && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia)
  const today = analysisDate || selectedMealDate || getTodayDateString()
  const remoteConsentRecord = storedRemoteConsent.userId === userId
    ? storedRemoteConsent.consent
    : readNutritionRemoteConsent(userId)
  const remoteConsent = remoteConsentDraft.userId === userId ? remoteConsentDraft.checked : false
  const hasRemoteConsent = remoteConsentRecord.granted === true || remoteConsent
  const resolveActiveImagePayload = () => getNutritionImagePayloadSnapshot(imagePayloadRef.current || imagePayload, currentImageRef.current)

  const scheduleResultScroll = useCallback(() => {
    const target = reviewRef.current
    if (!target || typeof window === 'undefined' || typeof document === 'undefined') return
    const behavior = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'

    try {
      target.scrollIntoView({ behavior, block: 'start', inline: 'start' })
    } catch {
      // Safari fallback if scrollIntoView is missing or restricted.
    }

    const nav = document.querySelector('.bottom-nav')
    if (typeof window.scrollTo !== 'function' || !nav || !Number.isFinite(target.getBoundingClientRect?.().top)) return
    if (typeof window.scrollY !== 'number') return

    const targetY = Math.max(
      0,
      window.scrollY + target.getBoundingClientRect().top - nav.offsetHeight - 16,
    )
    const maxY = Math.max(
      0,
      (document.documentElement?.scrollHeight || document.body?.scrollHeight || targetY) - (window.innerHeight || 0),
    )
    const clampedY = Math.min(maxY, targetY)

    try {
      window.scrollTo({ top: clampedY, behavior })
    } catch {
      window.scrollTo(0, clampedY)
    }
  }, [])

  function handleAnalysisAction(providerType, event) {
    const activeImagePayload = resolveActiveImagePayload()
    const now = typeof performance !== 'undefined' && Number.isFinite(performance.now())
      ? performance.now()
      : Date.now()

    if (now - lastAnalysisActionRef.current < 420) return
    lastAnalysisActionRef.current = now

    logAnalysisDiagnostic('button-handler-entered', {
      eventType: event?.type || 'unknown',
      photoReady: Boolean(activeImagePayload),
      requestedMode: providerType,
    })

    return analyzeImage(providerType, activeImagePayload)
  }

  function clearAnalysisReviewState() {
    setAnalysis(null)
    setReviewDraft(null)
    setSavedMealId('')
    setAllowDuplicate(false)
  }

  function updateRemoteDebug(patch) {
    if (!import.meta.env.DEV) return
    setRemoteDebug((current) => createScannerRemoteDebug({
      ...(current || {}),
      ...patch,
    }))
  }

  function logAnalysisDiagnostic(eventName, details = {}) {
    if (!import.meta.env.DEV) return
    safeLogger.info('Nutrition Scanner analysis flow', {
      event: eventName,
      ...details,
    })
  }

  function logCameraDiagnostic(eventName, input = cameraInputRef.current, extra = {}) {
    if (!import.meta.env.DEV) return
    safeLogger.info('Nutrition Scanner camera flow', {
      event: eventName,
      inputAccept: input?.accept || '',
      inputCapture: input?.getAttribute?.('capture') || '',
      inputDisabled: input?.disabled === true,
      inputExists: Boolean(input),
      inputType: input?.type || '',
      selectedFiles: input?.files?.length ? 'present' : 'none',
      ...extra,
    })
  }

  function handleCameraInputClick(event) {
    const input = event.currentTarget
    logCameraDiagnostic('camera native input click', input)
    input.value = ''
  }

  function setImagePayloadState(payload) {
    imagePayloadRef.current = payload
    setImagePayload(payload)
  }

  function clearImageState(clearInputs = false) {
    activeAnalysisControllerRef.current?.abort('explicitAbort')
    activeAnalysisControllerRef.current = null
    currentImageRef.current?.revoke?.()
    currentImageRef.current = null
    analysisInFlightRef.current = false
    if (previewUrl) revokeNutritionPhotoObjectUrl(previewUrl)
    setPreviewUrl('')
    setImagePayloadState(null)
    setFileName('')
    if (clearInputs) {
      clearImageInputs()
    }
  }

  function clearImageInputValue(input) {
    if (input) {
      input.value = ''
    }
  }

  function clearImageInputs() {
    clearImageInputValue(fileInputRef.current)
    clearImageInputValue(cameraInputRef.current)
  }

  function handleCameraInputEvent(event) {
    logCameraDiagnostic(`camera native input ${event.type}`, event.currentTarget)
  }

  function handleCameraFileChange(event) {
    logCameraDiagnostic('camera native input change', event.currentTarget)
    return handleFileChange(event)
  }

  useEffect(() => {
    headingRef.current?.focus()
    return () => {
      activeAnalysisControllerRef.current?.abort('componentCleanup')
      currentImageRef.current?.revoke?.()
    }
  }, [])

  useEffect(() => {
    function updateOnlineState() {
      setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
    }

    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') handleCancel()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (!reviewDraft) return

    window.requestAnimationFrame(() => {
      scheduleResultScroll()
    })
  }, [reviewDraft, scheduleResultScroll])

  const validation = useMemo(
    () => reviewDraft ? validatePhotoAnalysisReviewDraft(reviewDraft) : { errors: {}, ok: false },
    [reviewDraft],
  )
  const duplicate = useMemo(
    () => reviewDraft ? detectPhotoMealDuplicate(reviewDraft, meals) : { status: 'noDuplicate', message: '' },
    [meals, reviewDraft],
  )
  const ingredientMatches = useMemo(
    () => reviewDraft ? buildPhotoIngredientMatchSummary(reviewDraft.detectedItems) : { counts: {}, matches: [] },
    [reviewDraft],
  )
  const ingredientMatchStatusCounts = useMemo(
    () => reviewDraft ? buildPhotoIngredientMatchStatusCounts(reviewDraft.detectedItems, ingredientMatches.matches) : buildPhotoIngredientMatchStatusCounts(),
    [ingredientMatches.matches, reviewDraft],
  )
  const ingredientTotals = useMemo(
    () => reviewDraft ? calculateIngredientTotals(reviewDraft.detectedItems) : { calories: 0, carbs: 0, fat: 0, protein: 0 },
    [reviewDraft],
  )
  const reviewUncertainties = useMemo(() => {
    if (!analysis) return []
    return [
      ...safeArray(analysis.limitations).filter((item) => !isGenericUncertaintyText(item)),
      ...safeArray(analysis.analysisQuality?.limitations).filter((item) => !isGenericUncertaintyText(item)),
      ...safeArray(analysis.warnings).filter((item) => !isGenericUncertaintyText(item)),
      ...safeArray(analysis.uncertainIngredients).map((item) => `${getNutritionPhotoFoodDisplayName(item.name)}: ${item.reason}`),
      ...safeArray(analysis.components).flatMap(getConcreteComponentUncertainties),
    ].filter(Boolean).filter((item, index, items) => items.indexOf(item) === index).slice(0, 8)
  }, [analysis])
  const nutritionDifference = useMemo(() => {
    if (!reviewDraft) return { calories: 0, carbs: 0, fat: 0, protein: 0 }
    return {
      calories: Number(((reviewDraft.nutrition.calories || 0) - ingredientTotals.calories).toFixed(1)),
      carbs: Number(((reviewDraft.nutrition.carbs || 0) - ingredientTotals.carbs).toFixed(1)),
      fat: Number(((reviewDraft.nutrition.fat || 0) - ingredientTotals.fat).toFixed(1)),
      protein: Number(((reviewDraft.nutrition.protein || 0) - ingredientTotals.protein).toFixed(1)),
    }
  }, [ingredientTotals, reviewDraft])
  const remoteDebugRows = useMemo(() => {
    if (!import.meta.env.DEV || !remoteDebug) return []
    return [
      ['requestedMode', remoteDebug.requestedMode],
      ['analysisInputPresent', remoteDebug.analysisInputPresent],
      ['imageSelected', remoteDebug.imageSelected],
      ['previewPresent', remoteDebug.previewPresent],
      ['processedImagePresent', remoteDebug.processedImagePresent],
      ['authPresent', remoteDebug.authPresent],
      ['consentPresent', remoteDebug.consentPresent],
      ['requestStarted', remoteDebug.requestStarted],
      ['requestUrl', remoteDebug.requestUrl],
      ['clientAttemptId', remoteDebug.clientAttemptId],
      ['duplicateAttemptBlocked', remoteDebug.duplicateAttemptBlocked],
      ['responseStatus', remoteDebug.responseStatus],
      ['responseContentType', remoteDebug.responseContentType],
      ['apiErrorCode', remoteDebug.apiErrorCode],
      ['apiErrorMessage', remoteDebug.apiErrorMessage],
      ['abortSource', remoteDebug.abortSource],
      ['clientTimeoutMs', remoteDebug.clientTimeoutMs],
      ['providerAttempted', remoteDebug.providerAttempted],
      ['providerSucceeded', remoteDebug.providerSucceeded],
      ['normalizationSucceeded', remoteDebug.normalizationSucceeded],
      ['finalProviderType', remoteDebug.finalProviderType],
      ['fallbackUsed', remoteDebug.fallbackUsed],
      ['fallbackReason', remoteDebug.fallbackReason],
    ]
  }, [remoteDebug])
  const hasActiveImagePayload = Boolean(resolveActiveImagePayload())

  function clearTemporaryImage() {
    clearImageState(true)
    if (import.meta.env.DEV) setRemoteDebug(null)
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    setError('')
    setStatus('')
    setAnalysis(null)
    setReviewDraft(null)
    setSavedMealId('')
    setAllowDuplicate(false)
    if (import.meta.env.DEV) setRemoteDebug(null)

    if (shouldIgnoreEmptyNutritionImageSelection(file, resolveActiveImagePayload())) {
      setStatus('Bilden är fortfarande vald. Klicka på analysera när du vill fortsätta.')
      return
    }

    const fileValidation = validateNutritionPhotoFile(file)
    if (!fileValidation.ok) {
      clearImageState()
      setError(fileValidation.errors.join(' '))
      return
    }

    clearImageState()
    let result
    try {
      result = await preprocessNutritionPhoto(file)
      if (!result.ok) {
        setError(result.errors.join(' ') || 'Bilden kunde inte förberedas.')
        return
      }
    } catch {
      setError('Bilden kunde inte förberedas. Välj en annan bild och försök igen.')
      return
    }

    if (event?.currentTarget) clearImageInputValue(event.currentTarget)

    currentImageRef.current = result
    setPreviewUrl(result.previewUrl)
    setImagePayloadState({
      imageMetadata: result.metadata,
      processedBlob: result.processedBlob,
      previewUrl: result.previewUrl,
    })
    setFileName(file.name)
    setStatus('Bilden är förberedd lokalt. Klicka på analysera när du vill fortsätta.')
  }

  async function analyzeImage(providerType = 'local', imagePayloadSnapshot = null) {
    const activeImagePayload = imagePayloadSnapshot || resolveActiveImagePayload()
    const imageDebugState = createScannerImageDebugState(activeImagePayload)
    const requestedMode = providerType === 'remote' ? 'remote' : 'local'
    if (analysisInFlightRef.current) {
      if (requestedMode === 'remote') {
        updateRemoteDebug({
          ...imageDebugState,
          consentPresent: hasRemoteConsent,
          duplicateAttemptBlocked: true,
          fallbackReason: 'duplicate_attempt_blocked',
          fallbackUsed: false,
          requestedMode,
        })
      }
      logAnalysisDiagnostic('duplicate-analysis-blocked', {
        duplicateAttemptBlocked: true,
        requestedMode,
      })
      return
    }

    analysisInFlightRef.current = true
    if (requestedMode === 'remote') {
      updateRemoteDebug({
        authPresent: '',
        ...imageDebugState,
        consentPresent: hasRemoteConsent,
        requestedMode,
        requestStarted: false,
      })
    }
    logAnalysisDiagnostic('analysis-started', {
      blobPresent: Boolean(activeImagePayload?.processedBlob),
      photoReady: Boolean(activeImagePayload),
      requestedMode,
      storedConsent: remoteConsentRecord.granted === true,
    })

    const blocker = getNutritionAnalysisBlocker({
      imagePayload: activeImagePayload,
      isAnalyzing,
      isOnline,
      providerType,
      remoteConsent: hasRemoteConsent,
    })

    if (blocker) {
      if (providerType === 'remote') {
        clearAnalysisReviewState()
        updateRemoteDebug({
          ...imageDebugState,
          apiErrorMessage: blocker,
          consentPresent: hasRemoteConsent,
          fallbackReason: 'ui_blocker',
          fallbackUsed: false,
          requestedMode,
        })
      }
      logAnalysisDiagnostic('analysis-blocked', {
        blockerPresent: true,
        fallbackUsed: false,
        requestedMode,
      })
      setError(blocker)
      setStatus('')
      analysisInFlightRef.current = false
      return
    }

    let controller = null
    clearAnalysisReviewState()
    setIsAnalyzing(true)
    setError('')
    setStatus(providerType === 'remote' ? 'Analyserar måltiden…' : 'Skapar en grov uppskattning utan bildtolkning…')

    try {
      activeAnalysisControllerRef.current?.abort('supersededRequest')
      controller = createAnalysisController()
      activeAnalysisControllerRef.current = controller

      let result
      if (providerType === 'local') {
        logAnalysisDiagnostic('local-estimate-before-call', {
          blobPresent: Boolean(activeImagePayload?.processedBlob),
          fallbackUsed: true,
          requestedMode,
        })
        result = {
          analysis: createLocalNutritionPhotoEstimate({
            imageMetadata: activeImagePayload?.imageMetadata,
            mealType: reviewDraft?.mealType || 'Lunch',
          }, {
            analysisDate: today,
          }),
          ok: true,
          providerType: 'local',
        }
        logAnalysisDiagnostic('local-estimate-after-call', {
          finalProviderType: result.analysis?.provider?.type || 'unknown',
          fallbackUsed: true,
          requestedMode,
        })
      } else {
        if (remoteConsent && !remoteConsentRecord.granted) {
          setStoredRemoteConsent({
            consent: grantNutritionRemoteConsent(userId),
            userId,
          })
        }
        logAnalysisDiagnostic('remote-provider-before-call', {
          authPresent: 'unknown-before-provider',
          blobPresent: Boolean(activeImagePayload?.processedBlob),
          fallbackUsed: false,
          requestedMode,
          requestUrl: '/api/nutrition-photo-analysis',
        })
        updateRemoteDebug({
          ...imageDebugState,
          requestStarted: true,
          requestedMode,
          consentPresent: hasRemoteConsent,
        })
        const { analyzeNutritionPhoto } = await import('../services/nutritionPhotoAnalysisProvider.js')
        result = await analyzeNutritionPhoto({
          imageMetadata: activeImagePayload?.imageMetadata,
          mealType: reviewDraft?.mealType || 'Lunch',
          preprocessedImage: providerType === 'remote' ? activeImagePayload?.processedBlob : null,
        }, {
          analysisDate: today,
          providerType,
          signal: controller.signal,
        })
        updateRemoteDebug({
          ...(result.debug || {}),
          ...imageDebugState,
          consentPresent: hasRemoteConsent,
          requestedMode,
        })
        logAnalysisDiagnostic('remote-provider-after-call', {
          errorCode: result.errorCode || '',
          fallbackUsed: false,
          finalProviderType: result.analysis?.provider?.type || result.providerType || 'none',
          providerSucceeded: result.ok === true && Boolean(result.analysis),
          requestedMode,
        })
      }

      if (controller.signal.aborted) return
      if (activeAnalysisControllerRef.current === controller) activeAnalysisControllerRef.current = null

      if (!result.analysis) {
        if (providerType === 'remote') {
          updateRemoteDebug({
            ...(result.debug || {}),
            ...imageDebugState,
            apiErrorMessage: result.warning || result.debug?.apiErrorMessage || '',
            consentPresent: hasRemoteConsent,
            fallbackUsed: false,
            requestedMode,
          })
        }
        logAnalysisDiagnostic('analysis-no-result', {
          errorCode: result.errorCode || '',
          fallbackUsed: false,
          finalProviderType: result.providerType || 'none',
          requestedMode,
        })
        setError(result.warning || 'Analysen kunde inte slutföras.')
        setStatus('')
        return
      }

      const finalProviderType = result.analysis.provider?.type || result.providerType || ''
      if (providerType === 'remote' && finalProviderType !== 'remote') {
        updateRemoteDebug({
          ...(result.debug || {}),
          ...imageDebugState,
          consentPresent: hasRemoteConsent,
          fallbackReason: 'non_remote_provider_type',
          fallbackUsed: finalProviderType === 'local',
          finalProviderType,
          requestedMode,
        })
        logAnalysisDiagnostic('remote-result-rejected', {
          fallbackReason: 'non_remote_provider_type',
          fallbackUsed: finalProviderType === 'local',
          finalProviderType,
          requestedMode,
        })
        setError('AI-analysen gav inte ett giltigt resultat. Ingen lokal uppskattning visas automatiskt.')
        setStatus('')
        return
      }

      setAnalysis(result.analysis)
      setReviewDraft(createPhotoAnalysisReviewDraft(result.analysis, {
        analysisDate: today,
        mealType: 'Lunch',
        time: getCurrentTimeString(),
      }))
      if (providerType === 'remote') {
        updateRemoteDebug({
          ...(result.debug || {}),
          ...imageDebugState,
          consentPresent: hasRemoteConsent,
          fallbackUsed: false,
          finalProviderType,
          normalizationSucceeded: true,
          providerSucceeded: true,
          requestedMode,
        })
      }
      logAnalysisDiagnostic('review-state-set', {
        fallbackUsed: finalProviderType === 'local',
        finalProviderType,
        normalizationSucceeded: true,
        requestedMode,
      })
      setStatus(result.warning || 'Analysförslaget är klart. Granska och redigera innan du sparar.')
    } catch {
      if (!controller?.signal?.aborted) {
        if (providerType === 'remote') {
          updateRemoteDebug({
            apiErrorMessage: 'Analysen kunde inte startas.',
            ...imageDebugState,
            consentPresent: hasRemoteConsent,
            fallbackReason: 'ui_exception',
            fallbackUsed: false,
            requestedMode,
          })
        }
        logAnalysisDiagnostic('analysis-exception', {
          fallbackUsed: false,
          requestedMode,
        })
        setError('Analysen kunde inte startas. Försök igen eller välj en annan bild.')
        setStatus('')
      }
    } finally {
      if (activeAnalysisControllerRef.current === controller) activeAnalysisControllerRef.current = null
      analysisInFlightRef.current = false
      setIsAnalyzing(false)
    }
  }

  function updateReview(patch) {
    setReviewDraft((current) => current ? {
      ...current,
      ...patch,
      userEdited: true,
    } : current)
    setStatus('')
    setError('')
  }

  function updateNutrition(field, value) {
    updateReview({
      nutrition: {
        ...reviewDraft.nutrition,
        [field]: numericPatch(value),
      },
      nutritionProvenance: 'user_confirmed',
    })
  }

  function updateIngredient(id, patch) {
    updateReview({
      detectedItems: reviewDraft.detectedItems.map((item) => item.id === id ? { ...item, dataSource: 'manual', ...patch } : item),
    })
  }

  function applyDatabaseSuggestion(id, suggestion) {
    updateReview({
      detectedItems: reviewDraft.detectedItems.map((item) =>
        item.id === id ? applyPhotoIngredientDatabaseSuggestion(item, suggestion) : item),
    })
  }

  function addIngredient(overrides = {}) {
    const safeOverrides = overrides?.preventDefault ? {} : overrides
    updateReview({
      detectedItems: [
        ...safeArray(reviewDraft.detectedItems),
        {
          calories: '',
          carbohydrates: '',
          confidence: 'low',
          estimatedAmount: '',
          fat: '',
          id: `manual-item-${Date.now()}`,
          name: 'Ny ingrediens',
          protein: '',
          selected: true,
          unit: 'g',
          userEdited: true,
          dataSource: 'manual',
          ...safeOverrides,
        },
      ],
    })
  }

  function removeIngredient(id) {
    updateReview({
      detectedItems: reviewDraft.detectedItems.filter((item) => item.id !== id),
    })
  }

  function saveMeal(event) {
    event.preventDefault()
    if (!reviewDraft || isSaving) return
    if (!validation.ok) {
      setError(Object.values(validation.errors).join(' '))
      return
    }
    if ((duplicate.status === 'exactDuplicate' || duplicate.status === 'likelyDuplicate') && !allowDuplicate) {
      setError(duplicate.message)
      return
    }

    setIsSaving(true)
    try {
      const result = commitPhotoAnalysisMeal(reviewDraft, meals, { allowDuplicate })
      if (!result.ok) {
        setError(Object.values(result.errors).join(' '))
        return
      }

      onMealsChange?.(result.meals)
      onMealSaved?.(result.meal)
      clearTemporaryImage()
      setSavedMealId(result.meal.id)
      setStatus('Måltiden sparades i måltidsloggen utan bilddata.')
    } catch {
      setError('Måltiden kunde inte sparas. Kontrollera uppgifterna och försök igen.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    clearTemporaryImage()
    setAnalysis(null)
    setReviewDraft(null)
    setError('')
    setStatus('Scannern är rensad.')
    onClose?.()
  }

  function handleRemoteConsentChange(checked) {
    setRemoteConsentDraft({ checked, userId })
    setError('')
    if (checked) {
      setStoredRemoteConsent({
        consent: grantNutritionRemoteConsent(userId),
        userId,
      })
      setStatus('AI-analys är godkänd för den här användaren.')
      return
    }

    setStoredRemoteConsent({
      consent: revokeNutritionRemoteConsent(userId),
      userId,
    })
    setStatus('AI-analys är avstängd för den här användaren.')
  }

  function handleRevokeRemoteConsent() {
    setRemoteConsentDraft({ checked: false, userId })
    setStoredRemoteConsent({
      consent: revokeNutritionRemoteConsent(userId),
      userId,
    })
    setError('')
    setStatus('Samtycket är återkallat. Du behöver godkänna igen innan nästa AI-analys.')
  }

  return (
    <section className="photo-meal-tool scanner-tool nutrition-scanner-v2" aria-labelledby="nutrition-scanner-v2-heading">
      <div className="scanner-start-header">
        <h3 id="nutrition-scanner-v2-heading" ref={headingRef} tabIndex={-1}>Skanna mat</h3>
        <p>Ta eller välj en tydlig bild av måltiden.</p>
      </div>

      <div className="scanner-file-picker-group" aria-label="Bildval för Nutrition Scanner">
        <div className="photo-input scanner-file-picker scanner-camera-control">
          <span>Ta bild</span>
          <input
            className="scanner-camera-native-input"
            id="nutrition-scanner-photo-camera-input"
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Ta en ny matbild med kameran"
            onCancel={handleCameraInputEvent}
            onChange={handleCameraFileChange}
            onClick={handleCameraInputClick}
            onInput={handleCameraInputEvent}
          />
        </div>
        <label className="photo-input scanner-file-picker" htmlFor="nutrition-scanner-photo-library-input">
          <span>Välj bild</span>
          <input
            className="scanner-file-picker-input"
            id="nutrition-scanner-photo-library-input"
           ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Välj en matbild från bildbiblioteket"
            onClick={(event) => { event.currentTarget.value = '' }}
            onChange={handleFileChange}
          />
        </label>
      </div>
      {previewUrl && (
        <div className="scanner-preview-stage">
          <img className="food-preview" src={previewUrl} alt={fileName ? `Förhandsvisning av ${fileName}` : 'Temporär förhandsvisning av vald matbild'} />
          <div className="scanner-actions scanner-preview-actions">
            <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>Byt bild</button>
            <button type="button" className="secondary-button" onClick={clearTemporaryImage}>Ta bort</button>
          </div>
        </div>
      )}
      {remoteConsentRecord.granted ? (
        <div className="scanner-consent-row scanner-consent-status">
          <p className="estimate-note">Du har tidigare godkänt att bilden får analyseras med AI.</p>
          <button type="button" className="secondary-button" disabled={isAnalyzing} onClick={handleRevokeRemoteConsent}>
            Återkalla samtycke
          </button>
        </div>
      ) : (
        <label className="checkbox-row scanner-consent-row" htmlFor="nutrition-scanner-remote-consent">
          <input
            id="nutrition-scanner-remote-consent"
            checked={remoteConsent}
            disabled={isAnalyzing}
            type="checkbox"
            onChange={(event) => handleRemoteConsentChange(event.target.checked)}
          />
          <span>Jag godkänner att bilden skickas till tillfällig AI-analys. Originalbilden sparas inte och jag granskar resultatet innan sparning.</span>
        </label>
      )}
      <div className="scanner-actions scanner-primary-actions">
          <button className="primary-button" type="button" disabled={!hasActiveImagePayload || isAnalyzing || !isOnline} onClick={(event) => handleAnalysisAction('remote', event)}>
            {isAnalyzing ? 'Analyserar måltiden…' : 'Analysera maten'}
          </button>
        </div>
      {isAnalyzing && <ScannerAnalyzingStatus />}
      <details className="scanner-secondary-analysis">
        <summary>AI-analys fungerar inte?</summary>
        <p className="estimate-note">Alternativ analys ger en grov uppskattning utan att tolka bilden med AI.</p>
        <div className="scanner-actions">
          <button type="button" disabled={!hasActiveImagePayload || isAnalyzing} onClick={(event) => handleAnalysisAction('local', event)}>
            {isAnalyzing ? 'Analyserar...' : 'Lokal grov uppskattning'}
          </button>
          <button type="button" onClick={handleCancel}>Avbryt</button>
        </div>
        {!canUseLiveCamera && (
          <p className="estimate-note">
            Livekamera kräver normalt HTTPS eller localhost i Safari. På HTTP-LAN används filväljaren med kamera/bildbibliotek som fallback.
          </p>
        )}
      </details>
      <p className="estimate-note">
        Bilden skickas bara tillfälligt för analys. Ingen profil, historik eller kontoinformation skickas med.
      </p>
      <div aria-live="polite">
        {status && <p className="form-success">{status}</p>}
        {error && <p className="analysis-status" role="alert">{error}</p>}
      </div>
      {import.meta.env.DEV && remoteDebugRows.length > 0 && (
        <details className="remote-debug-panel scanner-dev-info">
          <summary>Utvecklarinfo</summary>
          <section aria-label="Remote debug">
            <h4>Utvecklarinfo</h4>
            <p className="estimate-note">Status: {isOnline ? 'Online' : 'Offline'}</p>
            <dl>
              {remoteDebugRows.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{debugValueLabel(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </details>
      )}

      {analysis && reviewDraft && (
        <form ref={reviewRef} className="inline-edit-form nutrition-scanner-review" onSubmit={saveMeal}>
          <div className="scanner-review-hero">
            <span className={`scanner-provider-badge ${analysis.provider.type === 'remote' ? 'is-remote' : 'is-local'}`}>
              {providerBadgeLabel(analysis.provider.type)}
            </span>
            <h4>{reviewDraft.mealName || 'Måltidsförslag'}</h4>
            {analysis.provider.type !== 'remote' && (
              <p className="estimate-note">Bildens innehåll har inte AI-tolkats. Förslaget bygger på metadata och generella intervall. Lokal grov uppskattning att granska.</p>
            )}
            <p className="scanner-hero-calories">≈ {nutritionMidpointLabel(reviewDraft.nutrition.calories, 'kcal')}</p>
            <dl className="scanner-summary-stats scanner-hero-macros">
              <div>
                <dt>Protein</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.protein, 'g')}</dd>
              </div>
              <div>
                <dt>Kolhydrater</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.carbs, 'g')}</dd>
              </div>
              <div>
                <dt>Fett</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.fat, 'g')}</dd>
              </div>
            </dl>
            <p className="scanner-hero-meta">
              Uppskattad portion: {reviewDraft.portionSize || portionRangeLabel(analysis.portionEstimate)}
            </p>
            <p className="scanner-hero-meta">
              Säkerhet: {confidenceLabel(analysis.confidence.level)}
              {analysis.imageQuality ? ` · Bild: ${imageQualityLabel(analysis.imageQuality)}` : ''}
            </p>
          </div>
          {getNutritionPhotoDisplayText(analysis.safeSummary) ? (
            <p className="scanner-review-lede">{getNutritionPhotoDisplayText(analysis.safeSummary)}</p>
          ) : null}

          {analysis.components?.length > 0 && (
            <section className="scanner-review-section">
              <h4>Identifierade komponenter</h4>
              <div className="nutrition-component-list">
                {analysis.components.map((component) => (
                  <details className="scanner-component-card" key={component.id}>
                    <summary>
                      <span>
                        <strong>{getNutritionPhotoFoodDisplayName(component.name)}</strong>
                        <small>
                          {component.portionEstimate?.gramsMin != null && component.portionEstimate?.gramsMax != null
                            ? `${component.portionEstimate.gramsMin}–${component.portionEstimate.gramsMax} g`
                            : componentPortionLabel(component)}
                          {component.portionEstimate?.pieceCount ? ` · ${component.portionEstimate.pieceCount} st` : ''}
                        </small>
                      </span>
                      <span>≈ {nutritionMidpointLabel(component.nutritionEstimate?.calories?.midpoint, 'kcal')}</span>
                    </summary>
                    <div className="scanner-component-detail">
                      {componentNutritionSummary(component) ? <p>{componentNutritionSummary(component)}</p> : null}
                      {component.nutritionEstimate?.proteinG && (
                        <p>Protein {nutritionMidpointLabel(component.nutritionEstimate.proteinG.midpoint, 'g')}</p>
                      )}
                      {component.cookingMethods?.length > 0 && (
                        <p>Tillagning: {component.cookingMethods.map(cookingMethodLabel).join(', ')}</p>
                      )}
                      <p>Portionssäkerhet: {confidenceLabel(component.portionEstimate?.confidence)}</p>
                      <p>Identitetssäkerhet: {confidenceLabel(component.identityConfidence || component.confidence)}</p>
                      {component.alternatives?.length > 0 && (
                        <p>Kan även vara: {component.alternatives.map(getNutritionPhotoFoodDisplayName).join(', ')}. Exakt typ osäker.</p>
                      )}
                      {component.portionEstimate?.evidence && <p>{component.portionEstimate.evidence}</p>}
                      {component.uncertainty?.reason && !isGenericUncertaintyText(component.uncertainty.reason) && <p>{component.uncertainty.reason}</p>}
                      <p className="estimate-note">{componentSummaryLine(component)}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}
          {reviewUncertainties.length > 0 && (
            <section className="scanner-review-section">
              <h4>Att kolla</h4>
              <ul className="health-dashboard-list">
                {reviewUncertainties.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          )}

          <details className="scanner-advanced-edit">
            <summary>Redigera detaljer</summary>
            <label>
              <span>Måltidsnamn</span>
              <input aria-invalid={Boolean(validation.errors.mealName)} value={reviewDraft.mealName} onChange={(event) => updateReview({ mealName: event.target.value })} />
            </label>
            <label>
              <span>Måltidstyp</span>
              <select value={reviewDraft.mealType} onChange={(event) => updateReview({ mealType: event.target.value })}>
                {mealTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span>Datum</span>
              <input type="date" value={reviewDraft.date} onChange={(event) => updateReview({ date: event.target.value })} />
            </label>
            <label>
              <span>Tid</span>
              <input type="time" value={reviewDraft.time} onChange={(event) => updateReview({ time: event.target.value })} />
            </label>
            <label>
              <span>Portion</span>
              <input value={reviewDraft.portionSize} onChange={(event) => updateReview({ portionSize: event.target.value })} />
            </label>

            <h4>Ingredienser</h4>
            <p className="estimate-note">
              Databasmatchning: {ingredientMatchStatusCounts.exactMatch} exakta, {ingredientMatchStatusCounts.normalizedMatch} normaliserade, {ingredientMatchStatusCounts.manualDatabase} manuella/databas, {ingredientMatchStatusCounts.needsSelection} behöver val, {ingredientMatchStatusCounts.aiEstimate} AI-estimat. Totalt {ingredientMatchStatusCounts.total}.
            </p>
            <ul className="health-dashboard-list">
              {reviewDraft.detectedItems.map((item) => (
                <IngredientEditor
                  disabled={isSaving}
                  item={item}
                  key={item.id}
                  match={ingredientMatches.matches.find((match) => match.id === item.id)}
                  onApplySuggestion={applyDatabaseSuggestion}
                  onChange={updateIngredient}
                  onRemove={removeIngredient}
                />
              ))}
              <li className="scanner-actions">
                <button type="button" onClick={() => addIngredient({ calories: 120, fat: 14, name: 'Olivolja', unit: 'msk' })}>Lägg till olja</button>
                <button type="button" onClick={() => addIngredient({ calories: 60, carbohydrates: 8, fat: 3, name: 'Sås', unit: 'msk' })}>Lägg till sås</button>
                <button type="button" onClick={() => addIngredient({ calories: 0, name: 'Dryck', unit: 'glas' })}>Lägg till dryck</button>
              </li>
            </ul>
            <button type="button" onClick={addIngredient}>Lägg till ingrediens</button>
            <label>
              <span>Anteckning</span>
              <textarea value={reviewDraft.note} onChange={(event) => updateReview({ note: event.target.value })} />
            </label>
            {['calories', 'protein', 'carbs', 'fat'].map((field) => (
              <label key={field} className="scanner-save-field">
                <span>{field === 'calories' ? 'Kalorier' : field === 'carbs' ? 'Kolhydrater' : field === 'protein' ? 'Protein' : 'Fett'}</span>
                <input
                  aria-invalid={Boolean(validation.errors[field])}
                  inputMode="decimal"
                  value={reviewDraft.nutrition[field] ?? ''}
                  onChange={(event) => updateNutrition(field, event.target.value)}
                />
              </label>
            ))}
          </details>

          <section className="scanner-save-summary">
            <h4>Det här sparas</h4>
            <dl className="scanner-summary-stats">
              <div>
                <dt>Kalorier</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.calories, 'kcal')}</dd>
              </div>
              <div>
                <dt>Protein</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.protein, 'g')}</dd>
              </div>
              <div>
                <dt>Kolhydrater</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.carbs, 'g')}</dd>
              </div>
              <div>
                <dt>Fett</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.fat, 'g')}</dd>
              </div>
            </dl>
            {Math.abs(nutritionDifference.calories) > 80 && (
              <p className="analysis-status">Kontrollera totalen: ingredienserna och sparvärdet skiljer sig tydligt.</p>
            )}
          </section>

          {duplicate.status !== 'noDuplicate' && (
            <p className="analysis-status">
              {duplicate.message} {duplicate.existingMealId && <a href="#meal-history">Öppna måltidshistorik</a>}
              {duplicate.status === 'possibleDuplicate' && (
                <label className="checkbox-row">
                  <input checked={allowDuplicate} type="checkbox" onChange={() => setAllowDuplicate((current) => !current)} />
                  <span>Spara ändå</span>
                </label>
              )}
            </p>
          )}

          <div className="habit-actions">
            <button className="primary-button" disabled={isSaving || !validation.ok || ((duplicate.status === 'exactDuplicate' || duplicate.status === 'likelyDuplicate') && !allowDuplicate)} type="submit">
              {isSaving ? 'Sparar...' : 'Spara måltid'}
            </button>
            <button type="button" onClick={handleCancel}>Avbryt</button>
            {savedMealId && <a className="secondary-button" href="#meal-history">Öppna sparad måltid</a>}
          </div>
        </form>
      )}
    </section>
  )
}

export default NutritionScannerV2
