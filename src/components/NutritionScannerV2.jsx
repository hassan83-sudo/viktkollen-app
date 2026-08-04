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
import { getCurrentTimeString, getTodayDateString, mealTypes } from '../services/nutritionService.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function numericPatch(value) {
  return value === '' ? '' : Number(value)
}

function IngredientEditor({ disabled, item, onChange, onRemove }) {
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
      <small>Confidence: {item.confidence}</small>
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
  const today = analysisDate || selectedMealDate || getTodayDateString()

  useEffect(() => {
    headingRef.current?.focus()
    return () => {
      currentImageRef.current?.revoke?.()
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

  function clearTemporaryImage() {
    currentImageRef.current?.revoke?.()
    currentImageRef.current = null
    if (previewUrl) revokeNutritionPhotoObjectUrl(previewUrl)
    setPreviewUrl('')
    setImagePayload(null)
    setFileName('')
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
    const result = await preprocessNutritionPhoto(file)
    if (!result.ok) {
      setError(result.errors.join(' '))
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
    setIsAnalyzing(true)
    setError('')
    setStatus(providerType === 'remote' ? 'Analyserar bild...' : 'Skapar lokal uppskattning...')

    const { analyzeNutritionPhoto } = await import('../services/nutritionPhotoAnalysisProvider.js')
    const result = await analyzeNutritionPhoto({
      imageMetadata: imagePayload.imageMetadata,
      mealType: reviewDraft?.mealType || 'Lunch',
      preprocessedImage: providerType === 'remote' ? imagePayload.processedBlob : null,
    }, {
      analysisDate: today,
      providerType,
    })

    if (!result.analysis) {
      setError(result.warning || 'Analysen kunde inte slutföras.')
      setIsAnalyzing(false)
      return
    }

    setAnalysis(result.analysis)
    setReviewDraft(createPhotoAnalysisReviewDraft(result.analysis, {
      analysisDate: today,
      mealType: 'Lunch',
      time: getCurrentTimeString(),
    }))
    setStatus(result.warning || 'Analysförslaget är klart. Granska och redigera innan du sparar.')
    setIsAnalyzing(false)
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
      detectedItems: reviewDraft.detectedItems.map((item) => item.id === id ? { ...item, ...patch } : item),
    })
  }

  function addIngredient() {
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
    const result = commitPhotoAnalysisMeal(reviewDraft, meals, { allowDuplicate })
    if (!result.ok) {
      setError(Object.values(result.errors).join(' '))
      setIsSaving(false)
      return
    }

    onMealsChange?.(result.meals)
    onMealSaved?.(result.meal)
    setSavedMealId(result.meal.id)
    setStatus('Måltiden sparades i måltidsloggen utan bilddata.')
    setIsSaving(false)
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
        <p className="eyebrow">Nutrition Scanner V2</p>
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

      <label className="photo-input">
        <span>Välj eller ta bild</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          aria-label="Välj eller ta en matbild för Nutrition Scanner"
          onChange={handleFileChange}
        />
      </label>
      {fileName && <p>Vald bild: {fileName}</p>}
      {previewUrl && <img className="food-preview" src={previewUrl} alt="Temporär förhandsvisning av vald matbild" />}
      <div className="scanner-actions">
        <button type="button" disabled={!imagePayload || isAnalyzing} onClick={() => analyzeImage('mock')}>
          {isAnalyzing ? 'Analyserar...' : 'Skapa lokal uppskattning'}
        </button>
        <button type="button" disabled={!imagePayload || isAnalyzing || typeof navigator !== 'undefined' && navigator.onLine === false} onClick={() => analyzeImage('remote')}>
          Remote analys
        </button>
        <button type="button" onClick={clearTemporaryImage}>Ta bort bild</button>
        <button type="button" onClick={handleCancel}>Avbryt</button>
      </div>
      <p className="estimate-note">
        Remote analys skickar bara temporärt förberedd bild och schema. Ingen profil, historik, auth/session eller localStorage-data skickas.
      </p>
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
          <ul className="health-dashboard-list">
            {reviewDraft.detectedItems.map((item) => (
              <IngredientEditor
                disabled={isSaving}
                item={item}
                key={item.id}
                onChange={updateIngredient}
                onRemove={removeIngredient}
              />
            ))}
          </ul>
          <button type="button" onClick={addIngredient}>Lägg till ingrediens</button>

          <h4>Näring att spara</h4>
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
