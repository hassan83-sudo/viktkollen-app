import { useEffect, useMemo, useRef, useState } from 'react'
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
  applyPhotoIngredientDatabaseSuggestion,
  buildPhotoIngredientMatchSummary,
} from '../services/nutritionPhotoIngredientMatching.js'
import { getCurrentTimeString, getTodayDateString, mealTypes } from '../services/nutritionService.js'

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
    manual: 'Manuellt värde',
    nutritionDatabase: 'Matdatabas',
  }[source] || 'AI-uppskattning'
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
    <li>
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
          <span>{field === 'calories' ? 'kcal' : field === 'carbohydrates' ? 'kolhydrater' : field}</span>
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
      <small>Confidence: {item.confidence}. Datakälla: {dataSourceLabel(item.dataSource)}</small>
      {match?.status === 'exactMatch' || match?.status === 'normalizedMatch' ? (
        <button disabled={disabled || item.userEdited} type="button" onClick={() => onApplySuggestion(item.id, match.matchedFood)}>
          Använd matdatabas: {match.matchedFood.name}
        </button>
      ) : null}
      {match?.status === 'multipleMatches' && (
        <small>Flera databasförslag finns. Välj manuellt innan något ersätts.</small>
      )}
      {match?.status === 'noMatch' && (
        <small>Ingen säker databasmatchning hittades.</small>
      )}
      <button disabled={disabled} type="button" onClick={() => onRemove(item.id)}>Ta bort</button>
    </li>
  )
}

function NutritionScannerV2({
  analysisDate,
  meals = [],
  onClose,
  onMealSaved,
  onMealsChange,
  selectedMealDate,
}) {
  const headingRef = useRef(null)
  const fileInputRef = useRef(null)
  const currentImageRef = useRef(null)
  const activeAnalysisControllerRef = useRef(null)
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
  const [remoteConsent, setRemoteConsent] = useState(false)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  const canUseLiveCamera = typeof window !== 'undefined' && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia)
  const today = analysisDate || selectedMealDate || getTodayDateString()

  useEffect(() => {
    headingRef.current?.focus()
    return () => {
      activeAnalysisControllerRef.current?.abort()
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
  const ingredientTotals = useMemo(
    () => reviewDraft ? calculateIngredientTotals(reviewDraft.detectedItems) : { calories: 0, carbs: 0, fat: 0, protein: 0 },
    [reviewDraft],
  )
  const nutritionDifference = useMemo(() => {
    if (!reviewDraft) return { calories: 0, carbs: 0, fat: 0, protein: 0 }
    return {
      calories: Number(((reviewDraft.nutrition.calories || 0) - ingredientTotals.calories).toFixed(1)),
      carbs: Number(((reviewDraft.nutrition.carbs || 0) - ingredientTotals.carbs).toFixed(1)),
      fat: Number(((reviewDraft.nutrition.fat || 0) - ingredientTotals.fat).toFixed(1)),
      protein: Number(((reviewDraft.nutrition.protein || 0) - ingredientTotals.protein).toFixed(1)),
    }
  }, [ingredientTotals, reviewDraft])

  function clearTemporaryImage() {
    activeAnalysisControllerRef.current?.abort()
    activeAnalysisControllerRef.current = null
    currentImageRef.current?.revoke?.()
    currentImageRef.current = null
    if (previewUrl) revokeNutritionPhotoObjectUrl(previewUrl)
    setPreviewUrl('')
    setImagePayload(null)
    setFileName('')
    setRemoteConsent(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    setError('')
    setStatus('')
    setAnalysis(null)
    setReviewDraft(null)
    setSavedMealId('')
    setAllowDuplicate(false)

    const fileValidation = validateNutritionPhotoFile(file)
    if (!fileValidation.ok) {
      clearTemporaryImage()
      setError(fileValidation.errors.join(' '))
      return
    }

    clearTemporaryImage()
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

    currentImageRef.current = result
    setPreviewUrl(result.previewUrl)
    setImagePayload({
      imageMetadata: result.metadata,
      processedBlob: result.processedBlob,
    })
    setFileName(file.name)
    setStatus('Bilden är förberedd lokalt. Klicka på analysera när du vill fortsätta.')
  }

  async function analyzeImage(providerType = 'mock') {
    if (!imagePayload || isAnalyzing) return
    if (providerType === 'remote' && !remoteConsent) {
      setError('Bekräfta först att bilden får skickas till tillfällig AI-analys.')
      return
    }
    if (providerType === 'remote' && !isOnline) {
      setError('Du är offline. Remote analys är inte tillgänglig just nu.')
      return
    }
    activeAnalysisControllerRef.current?.abort()
    const controller = new AbortController()
    activeAnalysisControllerRef.current = controller
    setIsAnalyzing(true)
    setError('')
    setStatus(providerType === 'remote' ? 'Analyserar bild...' : 'Skapar lokal uppskattning...')

    try {
      const { analyzeNutritionPhoto } = await import('../services/nutritionPhotoAnalysisProvider.js')
      const result = await analyzeNutritionPhoto({
        imageMetadata: imagePayload.imageMetadata,
        mealType: reviewDraft?.mealType || 'Lunch',
        preprocessedImage: providerType === 'remote' ? imagePayload.processedBlob : null,
      }, {
        analysisDate: today,
        providerType,
        signal: controller.signal,
      })

      if (controller.signal.aborted) return
      if (activeAnalysisControllerRef.current === controller) activeAnalysisControllerRef.current = null

      if (!result.analysis) {
        setError(result.warning || 'Analysen kunde inte slutföras.')
        return
      }

      setAnalysis(result.analysis)
      setReviewDraft(createPhotoAnalysisReviewDraft(result.analysis, {
        analysisDate: today,
        mealType: 'Lunch',
        time: getCurrentTimeString(),
      }))
      setStatus(result.warning || 'Analysförslaget är klart. Granska och redigera innan du sparar.')
    } catch {
      if (!controller.signal.aborted) {
        setError('Analysen kunde inte startas. Försök igen eller välj en annan bild.')
      }
    } finally {
      if (activeAnalysisControllerRef.current === controller) activeAnalysisControllerRef.current = null
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

  return (
    <section className="photo-meal-tool scanner-tool nutrition-scanner-v2" aria-labelledby="nutrition-scanner-v2-heading">
      <div>
        <p className="eyebrow">Nutrition Scanner V3</p>
        <h3 id="nutrition-scanner-v2-heading" ref={headingRef} tabIndex={-1}>Analysera matfoto säkert</h3>
        <p>
          Bildanalys är en uppskattning. Ingen måltid sparas förrän du har granskat och bekräftat resultatet.
        </p>
      </div>
      <ol className="health-dashboard-list">
        <li>1. Välj bild</li>
        <li>2. Starta analys</li>
        <li>3. Granska och redigera</li>
        <li>4. Bekräfta måltid</li>
      </ol>

      <label className="photo-input scanner-file-picker" htmlFor="nutrition-scanner-photo-input">
        <span>Välj eller ta bild</span>
        <small>{canUseLiveCamera ? 'Kamera eller bildbibliotek kan öppnas av webbläsaren.' : 'Livekamera kan blockeras på HTTP-LAN. Använd iPhone-dialogen för kamera eller bildbibliotek.'}</small>
        <input
          id="nutrition-scanner-photo-input"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Välj eller ta en matbild för Nutrition Scanner"
          onChange={handleFileChange}
        />
      </label>
      {fileName && <p>Vald bild: {fileName}</p>}
      {previewUrl && <img className="food-preview" src={previewUrl} alt="Temporär förhandsvisning av vald matbild" />}
      <label className="checkbox-row scanner-consent-row" htmlFor="nutrition-scanner-remote-consent">
        <input
          id="nutrition-scanner-remote-consent"
          checked={remoteConsent}
          disabled={isAnalyzing}
          type="checkbox"
          onChange={(event) => setRemoteConsent(event.target.checked)}
        />
        <span>Jag godkänner att bilden skickas till tillfällig AI-analys. Originalbilden sparas inte av Viktkollen och jag granskar resultatet innan sparning.</span>
      </label>
      <div className="scanner-actions">
        <button type="button" disabled={!imagePayload || isAnalyzing} onClick={() => analyzeImage('mock')}>
          {isAnalyzing ? 'Analyserar...' : 'Skapa lokal uppskattning'}
        </button>
        <button type="button" disabled={!imagePayload || isAnalyzing || !isOnline || !remoteConsent} onClick={() => analyzeImage('remote')}>
          Remote analys
        </button>
        <button type="button" onClick={clearTemporaryImage}>Ta bort bild</button>
        <button type="button" onClick={handleCancel}>Avbryt</button>
      </div>
      <p className="estimate-note">
        Remote analys skickar bara temporärt förberedd bild och schema. Ingen profil, historik, auth/session eller localStorage-data skickas.
      </p>
      {!canUseLiveCamera && (
        <p className="estimate-note">
          Livekamera kräver normalt HTTPS eller localhost i Safari. På HTTP-LAN används filväljaren med kamera/bildbibliotek som fallback.
        </p>
      )}
      <p className="estimate-note">Status: {isOnline ? 'Online' : 'Offline'}</p>
      <div aria-live="polite">
        {status && <p className="form-success">{status}</p>}
        {error && <p className="analysis-status" role="alert">{error}</p>}
      </div>

      {analysis && reviewDraft && (
        <form className="inline-edit-form nutrition-scanner-review" onSubmit={saveMeal}>
          <h4>Granska analysförslag</h4>
          <p>{analysis.safeSummary}</p>
          <p>Confidence: {analysis.confidence.level}. {analysis.confidence.text}</p>
          {analysis.limitations.map((item) => <p className="estimate-note" key={item}>{item}</p>)}

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
            Databasmatchning: {ingredientMatches.counts.exactMatch || 0} exakta, {ingredientMatches.counts.normalizedMatch || 0} normaliserade, {ingredientMatches.counts.multipleMatches || 0} behöver val.
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
              <button type="button" onClick={() => addIngredient({ calories: 60, carbs: 8, fat: 3, name: 'Sås', unit: 'msk' })}>Lägg till sås</button>
              <button type="button" onClick={() => addIngredient({ calories: 0, name: 'Dryck', unit: 'glas' })}>Lägg till dryck</button>
            </li>
          </ul>
          <button type="button" onClick={addIngredient}>Lägg till ingrediens</button>

          <h4>Näring att spara</h4>
          <p className="estimate-note">
            Ingredienssumma: {ingredientTotals.calories} kcal, {ingredientTotals.protein} g protein.
            Skillnad mot sparvärde: {nutritionDifference.calories} kcal, {nutritionDifference.protein} g protein.
          </p>
          {Math.abs(nutritionDifference.calories) > 80 && (
            <p className="analysis-status">Kontrollera totalen: ingredienserna och sparvärdet skiljer sig tydligt.</p>
          )}
          {['calories', 'protein', 'carbs', 'fat'].map((field) => (
            <label key={field}>
              <span>{field === 'calories' ? 'Kalorier' : field === 'carbs' ? 'Kolhydrater' : field}</span>
              <input
                aria-invalid={Boolean(validation.errors[field])}
                inputMode="decimal"
                value={reviewDraft.nutrition[field] ?? ''}
                onChange={(event) => updateNutrition(field, event.target.value)}
              />
            </label>
          ))}
          <label>
            <span>Anteckning</span>
            <textarea value={reviewDraft.note} onChange={(event) => updateReview({ note: event.target.value })} />
          </label>

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
              {isSaving ? 'Sparar...' : 'Bekräfta och spara måltid'}
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
