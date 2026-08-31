import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  createAnalysisApprovalKey,
  createOneShotAnalysisApproval,
} from '../services/security/oneShotAnalysisApproval.js'
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

const dataSourceKeys = {
  aiEstimate: 'scanner.dataSources.aiEstimate',
  barcode: 'scanner.dataSources.barcode',
  databaseDerived: 'scanner.dataSources.databaseDerived',
  manual: 'scanner.dataSources.manual',
  nutritionDatabase: 'scanner.dataSources.nutritionDatabase',
}

const confidenceKeys = {
  high: 'scanner.confidence.high',
  insufficient: 'scanner.confidence.insufficient',
  low: 'scanner.confidence.low',
  medium: 'scanner.confidence.medium',
}

const imageQualityKeys = {
  excellent: 'scanner.imageQuality.excellent',
  good: 'scanner.imageQuality.good',
  poor: 'scanner.imageQuality.poor',
  screen: 'scanner.imageQuality.screen',
  usable: 'scanner.imageQuality.usable',
}

const cookingMethodKeys = {
  baked: 'scanner.cookingMethods.baked',
  boiled: 'scanner.cookingMethods.boiled',
  breaded: 'scanner.cookingMethods.breaded',
  fried: 'scanner.cookingMethods.fried',
  grilled: 'scanner.cookingMethods.grilled',
  raw: 'scanner.cookingMethods.raw',
  roasted: 'scanner.cookingMethods.roasted',
  steamed: 'scanner.cookingMethods.steamed',
}

const componentCategoryKeys = {
  carbohydrate: 'scanner.categories.carbohydrate',
  fat: 'scanner.categories.fat',
  protein: 'scanner.categories.protein',
  sauce: 'scanner.categories.sauce',
  unknown: 'scanner.categories.unknown',
  vegetables: 'scanner.categories.vegetables',
}

const macroShortKeys = {
  calories: 'scanner.macros.kcal',
  carbsG: 'scanner.macros.carbsShort',
  fatG: 'scanner.macros.fatShort',
  fiberG: 'scanner.macros.fiber',
  proteinG: 'scanner.macros.proteinShort',
}

const scannerAnalysisStageKeys = [
  'scanner.stages.identifying',
  'scanner.stages.portions',
  'scanner.stages.nutrition',
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function numericPatch(value) {
  return value === '' ? '' : Number(value)
}

function dataSourceLabel(source, t) {
  return t(dataSourceKeys[source] || dataSourceKeys.aiEstimate)
}

function providerBadgeLabel(type, t) {
  return type === 'remote' ? t('scanner.provider.remote') : t('scanner.provider.local')
}

function confidenceLabel(level, t) {
  return t(confidenceKeys[level] || confidenceKeys.low)
}

function imageQualityLabel(level, t) {
  return t(imageQualityKeys[level] || confidenceKeys[level] || confidenceKeys.low)
}

function cookingMethodLabel(method, t) {
  return cookingMethodKeys[method] ? t(cookingMethodKeys[method]) : method
}

function componentCategoryLabel(category, t) {
  return t(componentCategoryKeys[category] || 'scanner.categories.fallback')
}

function macroLabel(field, t) {
  return macroShortKeys[field] ? t(macroShortKeys[field]) : field
}

function nutritionRangeLabel(range, unit, t) {
  if (!range) return t('scanner.missing')
  const decimals = unit === 'kcal' ? 0 : 1
  return `${Number(range.min).toFixed(decimals)}-${Number(range.max).toFixed(decimals)} ${unit}`
}

function nutritionMidpointLabel(value, unit, t) {
  if (!Number.isFinite(Number(value))) return t('scanner.missing')
  const decimals = unit === 'kcal' ? 0 : 1
  return `${Number(value).toFixed(decimals)} ${unit}`
}

function componentSummaryLine(component = {}, t, locale) {
  const category = componentCategoryLabel(component.category, t).toLocaleLowerCase(locale || 'sv-SE')
  const confidence = confidenceLabel(component.confidence, t)
  const alternatives = safeArray(component.alternatives)
  const reason = String(component.uncertainty?.reason || '').trim()
  const portionConfidence = component.portionEstimate?.confidence
  if (alternatives.length) {
    return t('scanner.component.summaryNeedsReview', { confidence, category })
  }
  if (reason && !isGenericUncertaintyText(reason)) {
    return t('scanner.component.summaryWithReason', { confidence, category, reason })
  }
  if (['low', 'insufficient'].includes(portionConfidence)) {
    return t('scanner.component.summaryPortionEstimated', { confidence, category })
  }
  return t('scanner.component.summaryBasic', { confidence, category })
}

function componentNutritionSummary(component = {}, t) {
  const nutrition = component.nutritionEstimate || {}
  return ['calories', 'proteinG', 'carbsG', 'fatG']
    .map((field) => {
      const unit = field === 'calories' ? 'kcal' : 'g'
      const range = nutrition[field]
      return range
        ? t('scanner.component.macroRange', {
          macro: macroLabel(field, t),
          range: nutritionRangeLabel(range, unit, t),
        })
        : ''
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

function portionRangeLabel(portion, t) {
  if (!portion) return t('scanner.unknownPortion')
  const grams = portion.gramsMin !== null && portion.gramsMax !== null
    ? t('scanner.portionGramsRange', { min: portion.gramsMin, max: portion.gramsMax })
    : ''

  return `${getNutritionPhotoPortionDisplayName(portion.description)}${grams}`
}

function componentPortionLabel(component, t) {
  const portion = component?.portionEstimate
  if (!portion || portion.gramsMin === null || portion.gramsMax === null) return t('scanner.amountUncertain')
  const midpoint = Math.round((portion.gramsMin + portion.gramsMax) / 2)

  return t('scanner.portionApproxMid', {
    mid: midpoint,
    min: portion.gramsMin,
    max: portion.gramsMax,
  })
}

function isGenericUncertaintyText(value = '') {
  return /komponenten kan vara osäker|component may be uncertain|kan vara osäker/i.test(String(value || ''))
}

function getConcreteComponentUncertainties(component = {}, t) {
  const displayName = getNutritionPhotoFoodDisplayName(component.name)
  const items = []
  const alternatives = safeArray(component.alternatives).map(getNutritionPhotoFoodDisplayName)
  const confidence = String(component.confidence || '')
  const reason = String(component.uncertainty?.reason || '').trim()
  const portionConfidence = component.portionEstimate?.confidence

  if (alternatives.length) {
    items.push(t('scanner.uncertainties.exactTypeUncertain', {
      name: displayName,
      alternatives: alternatives.join(', '),
    }))
  }
  if (reason && !isGenericUncertaintyText(reason)) {
    items.push(t('scanner.uncertainties.namedReason', { name: displayName, reason }))
  }
  if (['low', 'insufficient'].includes(confidence)) {
    items.push(t('scanner.uncertainties.lowConfidence', { name: displayName }))
  }
  if (confidence === 'medium' && !alternatives.length && !reason) {
    items.push(t('scanner.uncertainties.mediumConfidence', { name: displayName }))
  }
  if (['low', 'insufficient'].includes(portionConfidence)) {
    items.push(t('scanner.uncertainties.portionEstimate', { name: displayName }))
  }
  if (component.category === 'sauce' && !alternatives.length && !reason) {
    items.push(t('scanner.uncertainties.sauceNeedsReview', { name: displayName }))
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

function ingredientFieldLabel(field, t) {
  if (field === 'calories') return t('scanner.macros.kcal')
  if (field === 'carbohydrates') return t('scanner.macros.carbohydrates')
  if (field === 'fat') return t('scanner.macros.fatShort')
  if (field === 'protein') return t('scanner.macros.proteinShort')
  return field
}

function reviewMacroLabel(field, t) {
  if (field === 'calories') return t('scanner.macros.calories')
  if (field === 'carbs') return t('scanner.macros.carbs')
  if (field === 'protein') return t('scanner.macros.protein')
  return t('scanner.macros.fat')
}

function IngredientEditor({ disabled, item, match, onApplySuggestion, onChange, onRemove }) {
  const { t } = useTranslation(['nutrition', 'common'])

  return (
    <li className="scanner-ingredient-edit-item">
      <details>
        <summary>
          <span>
            <strong>{getNutritionPhotoFoodDisplayName(item.name)}</strong>
            <small>
              {t('scanner.ingredient.summaryLine', {
                amount: item.estimatedAmount || t('scanner.amountUncertain'),
                unit: item.unit || 'g',
                confidence: confidenceLabel(item.confidence, t),
              })}
            </small>
          </span>
          <span>{dataSourceLabel(item.dataSource, t)}</span>
        </summary>
        <div className="scanner-ingredient-edit-grid">
          <label>
            <span>{t('scanner.ingredient.name')}</span>
            <input
              disabled={disabled}
              value={item.name}
              onChange={(event) => onChange(item.id, { name: event.target.value, userEdited: true })}
            />
          </label>
          <label>
            <span>{t('scanner.ingredient.amount')}</span>
            <input
              disabled={disabled}
              inputMode="decimal"
              value={item.estimatedAmount ?? ''}
              onChange={(event) => onChange(item.id, { estimatedAmount: numericPatch(event.target.value), userEdited: true })}
            />
          </label>
          <label>
            <span>{t('scanner.ingredient.unit')}</span>
            <input
              disabled={disabled}
              value={item.unit}
              onChange={(event) => onChange(item.id, { unit: event.target.value, userEdited: true })}
            />
          </label>
          {['calories', 'protein', 'carbohydrates', 'fat'].map((field) => (
            <label key={field}>
              <span>{ingredientFieldLabel(field, t)}</span>
              <input
                disabled={disabled}
                inputMode="decimal"
                value={item[field] ?? ''}
                onChange={(event) => onChange(item.id, { [field]: numericPatch(event.target.value), userEdited: true })}
              />
            </label>
          ))}
          <label>
            <span>{t('scanner.ingredient.uncertain')}</span>
            <input
              checked={item.uncertain === true}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => onChange(item.id, { uncertain: event.target.checked, userEdited: true })}
            />
          </label>
        </div>
        <p className="estimate-note">
          {t('scanner.ingredient.dataSourceNote', {
            source: dataSourceLabel(item.dataSource, t),
            confidence: confidenceLabel(item.confidence, t),
          })}
        </p>
        {match?.status === 'exactMatch' || match?.status === 'normalizedMatch' ? (
          <button disabled={disabled || item.userEdited} type="button" onClick={() => onApplySuggestion(item.id, match.matchedFood)}>
            {t('scanner.ingredient.useDatabase', { name: match.matchedFood.name })}
          </button>
        ) : null}
        {match?.status === 'multipleMatches' && (
          <small>{t('scanner.ingredient.multipleMatches')}</small>
        )}
        {match?.status === 'noMatch' && (
          <small>{t('scanner.ingredient.noMatch')}</small>
        )}
        <button disabled={disabled} type="button" onClick={() => onRemove(item.id)}>{t('common:remove')}</button>
      </details>
    </li>
  )
}

function ScannerAnalyzingStatus() {
  const { t } = useTranslation(['nutrition', 'common'])
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    let index = 0
    const timer = window.setInterval(() => {
      index = Math.min(index + 1, scannerAnalysisStageKeys.length - 1)
      setStageIndex(index)
    }, 1600)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="scanner-analyzing-state" role="status">
      <p><strong>{t('scanner.analyzing')}</strong></p>
      <p className="estimate-note">{t(scannerAnalysisStageKeys[stageIndex])}</p>
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
  const { t, i18n } = useTranslation(['nutrition', 'common'])
  const headingRef = useRef(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const reviewRef = useRef(null)
  const currentImageRef = useRef(null)
  const imagePayloadRef = useRef(null)
  const activeAnalysisControllerRef = useRef(null)
  const remoteAnalysisApprovalRef = useRef(createOneShotAnalysisApproval())
  const analysisInFlightRef = useRef(false)
  const lastAnalysisActionRef = useRef(0)
  const [status, setStatus] = useState(() => t('scanner.status.idle'))
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
  const resolveActiveImagePayload = () => getNutritionImagePayloadSnapshot(imagePayloadRef.current || imagePayload, currentImageRef.current)
  const mealTypeLabel = (type) => t(`scanner.mealTypes.${type}`, { defaultValue: type })

  function getRemoteAnalysisApprovalKey(payload = resolveActiveImagePayload()) {
    return createAnalysisApprovalKey([
      {
        label: 'nutrition-photo',
        previewUrl: payload?.previewUrl,
        source: payload?.processedBlob,
      },
    ])
  }

  function clearRemoteAnalysisApproval() {
    remoteAnalysisApprovalRef.current.clear()
    setRemoteConsentDraft({ checked: false, userId })
  }

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
    clearRemoteAnalysisApproval()
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
      ...safeArray(analysis.uncertainIngredients).map((item) => t('scanner.uncertainties.namedReason', {
        name: getNutritionPhotoFoodDisplayName(item.name),
        reason: item.reason,
      })),
      ...safeArray(analysis.components).flatMap((component) => getConcreteComponentUncertainties(component, t)),
    ].filter(Boolean).filter((item, index, items) => items.indexOf(item) === index).slice(0, 8)
  }, [analysis, t])
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
    clearRemoteAnalysisApproval()
    setError('')
    setStatus('')
    setAnalysis(null)
    setReviewDraft(null)
    setSavedMealId('')
    setAllowDuplicate(false)
    if (import.meta.env.DEV) setRemoteDebug(null)

    if (shouldIgnoreEmptyNutritionImageSelection(file, resolveActiveImagePayload())) {
      setStatus(t('scanner.status.stillSelected'))
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
        setError(result.errors.join(' ') || t('scanner.errors.prepareFailed'))
        return
      }
    } catch {
      setError(t('scanner.errors.prepareFailedRetry'))
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
    setStatus(t('scanner.status.prepared'))
  }

  async function analyzeImage(providerType = 'local', imagePayloadSnapshot = null) {
    const activeImagePayload = imagePayloadSnapshot || resolveActiveImagePayload()
    const imageDebugState = createScannerImageDebugState(activeImagePayload)
    const requestedMode = providerType === 'remote' ? 'remote' : 'local'
    if (analysisInFlightRef.current) {
      if (requestedMode === 'remote') {
        updateRemoteDebug({
          ...imageDebugState,
          consentPresent: remoteAnalysisApprovalRef.current.has(getRemoteAnalysisApprovalKey(activeImagePayload)),
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

    const remoteConsentApprovedForAttempt = requestedMode === 'remote'
      ? remoteAnalysisApprovalRef.current.consume(getRemoteAnalysisApprovalKey(activeImagePayload))
      : false
    if (requestedMode === 'remote') {
      setRemoteConsentDraft({ checked: false, userId })
    }
    analysisInFlightRef.current = true
    if (requestedMode === 'remote') {
      updateRemoteDebug({
        authPresent: '',
        ...imageDebugState,
        consentPresent: remoteConsentApprovedForAttempt,
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
      remoteConsent: remoteConsentApprovedForAttempt,
    })

    if (blocker) {
      if (providerType === 'remote') {
        clearAnalysisReviewState()
        updateRemoteDebug({
          ...imageDebugState,
          apiErrorMessage: blocker,
          consentPresent: remoteConsentApprovedForAttempt,
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
    setStatus(providerType === 'remote' ? t('scanner.status.analyzingRemote') : t('scanner.status.analyzingLocal'))

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
        if (remoteConsentApprovedForAttempt && !remoteConsentRecord.granted) {
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
          consentPresent: remoteConsentApprovedForAttempt,
        })
        const { analyzeNutritionPhoto } = await import('../services/nutritionPhotoAnalysisProvider.js')
        result = await analyzeNutritionPhoto({
          imageMetadata: activeImagePayload?.imageMetadata,
          mealType: reviewDraft?.mealType || 'Lunch',
          preprocessedImage: providerType === 'remote' ? activeImagePayload?.processedBlob : null,
        }, {
          analysisDate: today,
          consentApproved: remoteConsentApprovedForAttempt,
          providerType,
          signal: controller.signal,
        })
        updateRemoteDebug({
          ...(result.debug || {}),
          ...imageDebugState,
          consentPresent: remoteConsentApprovedForAttempt,
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
            consentPresent: remoteConsentApprovedForAttempt,
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
        setError(result.warning || t('scanner.errors.analysisFailed'))
        setStatus('')
        return
      }

      const finalProviderType = result.analysis.provider?.type || result.providerType || ''
      if (providerType === 'remote' && finalProviderType !== 'remote') {
        updateRemoteDebug({
          ...(result.debug || {}),
          ...imageDebugState,
          consentPresent: remoteConsentApprovedForAttempt,
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
        setError(t('scanner.errors.remoteInvalid'))
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
          consentPresent: remoteConsentApprovedForAttempt,
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
      setStatus(result.warning || t('scanner.status.reviewReady'))
    } catch {
      if (!controller?.signal?.aborted) {
        if (providerType === 'remote') {
          updateRemoteDebug({
            apiErrorMessage: t('scanner.errors.analysisStartFailedShort'),
            ...imageDebugState,
            consentPresent: remoteConsentApprovedForAttempt,
            fallbackReason: 'ui_exception',
            fallbackUsed: false,
            requestedMode,
          })
        }
        logAnalysisDiagnostic('analysis-exception', {
          fallbackUsed: false,
          requestedMode,
        })
        setError(t('scanner.errors.analysisStartFailed'))
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
      setStatus(t('scanner.status.saved'))
    } catch {
      setError(t('scanner.errors.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    clearTemporaryImage()
    setAnalysis(null)
    setReviewDraft(null)
    setError('')
    setStatus(t('scanner.status.cleared'))
    onClose?.()
  }

  function handleRemoteConsentChange(checked) {
    setRemoteConsentDraft({ checked, userId })
    setError('')
    if (checked) {
      remoteAnalysisApprovalRef.current.approve(getRemoteAnalysisApprovalKey())
      setStoredRemoteConsent({
        consent: grantNutritionRemoteConsent(userId),
        userId,
      })
      setStatus(t('scanner.status.consentOn'))
      return
    }

    remoteAnalysisApprovalRef.current.clear()
    setStoredRemoteConsent({
      consent: revokeNutritionRemoteConsent(userId),
      userId,
    })
    setStatus(t('scanner.status.consentOff'))
  }

  function handleRevokeRemoteConsent() {
    remoteAnalysisApprovalRef.current.clear()
    setRemoteConsentDraft({ checked: false, userId })
    setStoredRemoteConsent({
      consent: revokeNutritionRemoteConsent(userId),
      userId,
    })
    setError('')
    setStatus(t('scanner.status.consentRevoked'))
  }

  return (
    <section className="photo-meal-tool scanner-tool nutrition-scanner-v2" aria-labelledby="nutrition-scanner-v2-heading">
      <div className="scanner-start-header">
        <h3 id="nutrition-scanner-v2-heading" ref={headingRef} tabIndex={-1}>{t('scanner.title')}</h3>
        <p>{t('scanner.subtitle')}</p>
      </div>

      <div className="scanner-file-picker-group" aria-label={t('scanner.imagePickerAria')}>
        <div className="photo-input scanner-file-picker scanner-camera-control">
          <span>{t('scanner.takePhoto')}</span>
          <input
            className="scanner-camera-native-input"
            id="nutrition-scanner-photo-camera-input"
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label={t('scanner.takePhotoAria')}
            onCancel={handleCameraInputEvent}
            onChange={handleCameraFileChange}
            onClick={handleCameraInputClick}
            onInput={handleCameraInputEvent}
          />
        </div>
        <label className="photo-input scanner-file-picker" htmlFor="nutrition-scanner-photo-library-input">
          <span>{t('scanner.chooseImage')}</span>
          <input
            className="scanner-file-picker-input"
            id="nutrition-scanner-photo-library-input"
           ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label={t('scanner.chooseImageAria')}
            onClick={(event) => { event.currentTarget.value = '' }}
            onChange={handleFileChange}
          />
        </label>
      </div>
      {previewUrl && (
        <div className="scanner-preview-stage">
          <img
            className="food-preview"
            src={previewUrl}
            alt={fileName ? t('scanner.previewAltNamed', { fileName }) : t('scanner.previewAlt')}
          />
          <div className="scanner-actions scanner-preview-actions">
            <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>{t('scanner.changeImage')}</button>
            <button type="button" className="secondary-button" onClick={clearTemporaryImage}>{t('common:remove')}</button>
          </div>
        </div>
      )}
      {remoteConsentRecord.granted && (
        <div className="scanner-consent-row scanner-consent-status">
          <p className="estimate-note">{t('scanner.consentGranted')}</p>
          <button type="button" className="secondary-button" disabled={isAnalyzing} onClick={handleRevokeRemoteConsent}>
            {t('scanner.revokeConsent')}
          </button>
        </div>
      )}
      <label className="checkbox-row scanner-consent-row" htmlFor="nutrition-scanner-remote-consent">
        <input
          id="nutrition-scanner-remote-consent"
          checked={remoteConsent}
          disabled={isAnalyzing}
          type="checkbox"
          onChange={(event) => handleRemoteConsentChange(event.target.checked)}
        />
        <span>{t('scanner.consentLabel')}</span>
      </label>
      <div className="scanner-actions scanner-primary-actions">
          <button className="primary-button" type="button" disabled={!hasActiveImagePayload || isAnalyzing || !isOnline} onClick={(event) => handleAnalysisAction('remote', event)}>
            {isAnalyzing ? t('scanner.analyzing') : t('scanner.analyzeFood')}
          </button>
        </div>
      {isAnalyzing && <ScannerAnalyzingStatus />}
      <details className="scanner-secondary-analysis">
        <summary>{t('scanner.aiNotWorking')}</summary>
        <p className="estimate-note">{t('scanner.localEstimateHint')}</p>
        <div className="scanner-actions">
          <button type="button" disabled={!hasActiveImagePayload || isAnalyzing} onClick={(event) => handleAnalysisAction('local', event)}>
            {isAnalyzing ? t('scanner.analyzingShort') : t('scanner.localEstimate')}
          </button>
          <button type="button" onClick={handleCancel}>{t('common:actions.cancel')}</button>
        </div>
        {!canUseLiveCamera && (
          <p className="estimate-note">
            {t('scanner.liveCameraNote')}
          </p>
        )}
      </details>
      <p className="estimate-note">
        {t('scanner.privacyNote')}
      </p>
      <div aria-live="polite">
        {status && <p className="form-success">{status}</p>}
        {error && <p className="analysis-status" role="alert">{error}</p>}
      </div>
      {import.meta.env.DEV && remoteDebugRows.length > 0 && (
        <details className="remote-debug-panel scanner-dev-info">
          <summary>{t('scanner.developerInfo')}</summary>
          <section aria-label={t('scanner.remoteDebugAria')}>
            <h4>{t('scanner.developerInfo')}</h4>
            <p className="estimate-note">{t('scanner.connectionStatus', { status: isOnline ? t('scanner.online') : t('scanner.offline') })}</p>
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
              {providerBadgeLabel(analysis.provider.type, t)}
            </span>
            <h4>{reviewDraft.mealName || t('scanner.mealSuggestion')}</h4>
            {analysis.provider.type !== 'remote' && (
              <p className="estimate-note">{t('scanner.localNotAiInterpreted')}</p>
            )}
            <p className="scanner-hero-calories">{t('scanner.approxCalories', { value: nutritionMidpointLabel(reviewDraft.nutrition.calories, 'kcal', t) })}</p>
            <dl className="scanner-summary-stats scanner-hero-macros">
              <div>
                <dt>{t('scanner.macros.protein')}</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.protein, 'g', t)}</dd>
              </div>
              <div>
                <dt>{t('scanner.macros.carbs')}</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.carbs, 'g', t)}</dd>
              </div>
              <div>
                <dt>{t('scanner.macros.fat')}</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.fat, 'g', t)}</dd>
              </div>
            </dl>
            <p className="scanner-hero-meta">
              {t('scanner.estimatedPortion', {
                portion: reviewDraft.portionSize || portionRangeLabel(analysis.portionEstimate, t),
              })}
            </p>
            <p className="scanner-hero-meta">
              {t('scanner.confidenceLine', { level: confidenceLabel(analysis.confidence.level, t) })}
              {analysis.imageQuality ? t('scanner.imageQualitySuffix', { quality: imageQualityLabel(analysis.imageQuality, t) }) : ''}
            </p>
          </div>
          {getNutritionPhotoDisplayText(analysis.safeSummary) ? (
            <p className="scanner-review-lede">{getNutritionPhotoDisplayText(analysis.safeSummary)}</p>
          ) : null}

          {analysis.components?.length > 0 && (
            <section className="scanner-review-section">
              <h4>{t('scanner.identifiedComponents')}</h4>
              <div className="nutrition-component-list">
                {analysis.components.map((component) => (
                  <details className="scanner-component-card" key={component.id}>
                    <summary>
                      <span>
                        <strong>{getNutritionPhotoFoodDisplayName(component.name)}</strong>
                        <small>
                          {component.portionEstimate?.gramsMin != null && component.portionEstimate?.gramsMax != null
                            ? t('scanner.gramsRange', {
                              min: component.portionEstimate.gramsMin,
                              max: component.portionEstimate.gramsMax,
                            })
                            : componentPortionLabel(component, t)}
                          {component.portionEstimate?.pieceCount
                            ? ` · ${t('scanner.piecesCount', { count: component.portionEstimate.pieceCount })}`
                            : ''}
                        </small>
                      </span>
                      <span>{t('scanner.approxCalories', { value: nutritionMidpointLabel(component.nutritionEstimate?.calories?.midpoint, 'kcal', t) })}</span>
                    </summary>
                    <div className="scanner-component-detail">
                      {componentNutritionSummary(component, t) ? <p>{componentNutritionSummary(component, t)}</p> : null}
                      {component.nutritionEstimate?.proteinG && (
                        <p>{t('scanner.proteinLine', { value: nutritionMidpointLabel(component.nutritionEstimate.proteinG.midpoint, 'g', t) })}</p>
                      )}
                      {component.cookingMethods?.length > 0 && (
                        <p>{t('scanner.cookingMethodsLine', {
                          methods: component.cookingMethods.map((method) => cookingMethodLabel(method, t)).join(', '),
                        })}</p>
                      )}
                      <p>{t('scanner.portionConfidenceLine', { level: confidenceLabel(component.portionEstimate?.confidence, t) })}</p>
                      <p>{t('scanner.identityConfidenceLine', { level: confidenceLabel(component.identityConfidence || component.confidence, t) })}</p>
                      {component.alternatives?.length > 0 && (
                        <p>{t('scanner.couldAlsoBe', {
                          names: component.alternatives.map(getNutritionPhotoFoodDisplayName).join(', '),
                        })}</p>
                      )}
                      {component.portionEstimate?.evidence && <p>{component.portionEstimate.evidence}</p>}
                      {component.uncertainty?.reason && !isGenericUncertaintyText(component.uncertainty.reason) && <p>{component.uncertainty.reason}</p>}
                      <p className="estimate-note">{componentSummaryLine(component, t, i18n.language)}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}
          {reviewUncertainties.length > 0 && (
            <section className="scanner-review-section">
              <h4>{t('scanner.toCheck')}</h4>
              <ul className="health-dashboard-list">
                {reviewUncertainties.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          )}

          <details className="scanner-advanced-edit">
            <summary>{t('scanner.editDetails')}</summary>
            <label>
              <span>{t('scanner.mealName')}</span>
              <input aria-invalid={Boolean(validation.errors.mealName)} value={reviewDraft.mealName} onChange={(event) => updateReview({ mealName: event.target.value })} />
            </label>
            <label>
              <span>{t('scanner.mealType')}</span>
              <select value={reviewDraft.mealType} onChange={(event) => updateReview({ mealType: event.target.value })}>
                {mealTypes.map((type) => (
                  <option key={type} value={type}>{mealTypeLabel(type)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('scanner.date')}</span>
              <input type="date" value={reviewDraft.date} onChange={(event) => updateReview({ date: event.target.value })} />
            </label>
            <label>
              <span>{t('scanner.time')}</span>
              <input type="time" value={reviewDraft.time} onChange={(event) => updateReview({ time: event.target.value })} />
            </label>
            <label>
              <span>{t('scanner.portion')}</span>
              <input value={reviewDraft.portionSize} onChange={(event) => updateReview({ portionSize: event.target.value })} />
            </label>

            <h4>{t('scanner.ingredients')}</h4>
            <p className="estimate-note">
              {t('scanner.dbMatchSummary', {
                exactMatch: ingredientMatchStatusCounts.exactMatch,
                normalizedMatch: ingredientMatchStatusCounts.normalizedMatch,
                manualDatabase: ingredientMatchStatusCounts.manualDatabase,
                needsSelection: ingredientMatchStatusCounts.needsSelection,
                aiEstimate: ingredientMatchStatusCounts.aiEstimate,
                total: ingredientMatchStatusCounts.total,
              })}
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
                <button type="button" onClick={() => addIngredient({ calories: 120, fat: 14, name: 'Olivolja', unit: 'msk' })}>{t('scanner.addOil')}</button>
                <button type="button" onClick={() => addIngredient({ calories: 60, carbohydrates: 8, fat: 3, name: 'Sås', unit: 'msk' })}>{t('scanner.addSauce')}</button>
                <button type="button" onClick={() => addIngredient({ calories: 0, name: 'Dryck', unit: 'glas' })}>{t('scanner.addDrink')}</button>
              </li>
            </ul>
            <button type="button" onClick={addIngredient}>{t('scanner.addIngredient')}</button>
            <label>
              <span>{t('scanner.note')}</span>
              <textarea value={reviewDraft.note} onChange={(event) => updateReview({ note: event.target.value })} />
            </label>
            {['calories', 'protein', 'carbs', 'fat'].map((field) => (
              <label key={field} className="scanner-save-field">
                <span>{reviewMacroLabel(field, t)}</span>
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
            <h4>{t('scanner.whatIsSaved')}</h4>
            <dl className="scanner-summary-stats">
              <div>
                <dt>{t('scanner.macros.calories')}</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.calories, 'kcal', t)}</dd>
              </div>
              <div>
                <dt>{t('scanner.macros.protein')}</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.protein, 'g', t)}</dd>
              </div>
              <div>
                <dt>{t('scanner.macros.carbs')}</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.carbs, 'g', t)}</dd>
              </div>
              <div>
                <dt>{t('scanner.macros.fat')}</dt>
                <dd>{nutritionMidpointLabel(reviewDraft.nutrition.fat, 'g', t)}</dd>
              </div>
            </dl>
            {Math.abs(nutritionDifference.calories) > 80 && (
              <p className="analysis-status">{t('scanner.totalMismatch')}</p>
            )}
          </section>

          {duplicate.status !== 'noDuplicate' && (
            <p className="analysis-status">
              {duplicate.message} {duplicate.existingMealId && <a href="#meal-history">{t('scanner.openMealHistory')}</a>}
              {duplicate.status === 'possibleDuplicate' && (
                <label className="checkbox-row">
                  <input checked={allowDuplicate} type="checkbox" onChange={() => setAllowDuplicate((current) => !current)} />
                  <span>{t('scanner.saveAnyway')}</span>
                </label>
              )}
            </p>
          )}

          <div className="habit-actions">
            <button className="primary-button" disabled={isSaving || !validation.ok || ((duplicate.status === 'exactDuplicate' || duplicate.status === 'likelyDuplicate') && !allowDuplicate)} type="submit">
              {isSaving ? t('scanner.saving') : t('scanner.saveMeal')}
            </button>
            <button type="button" onClick={handleCancel}>{t('common:actions.cancel')}</button>
            {savedMealId && <a className="secondary-button" href="#meal-history">{t('scanner.openSavedMeal')}</a>}
          </div>
        </form>
      )}
    </section>
  )
}

export default NutritionScannerV2
