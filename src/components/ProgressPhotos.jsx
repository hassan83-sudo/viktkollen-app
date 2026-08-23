import { useState } from 'react'
import BodyAnalysisCard from './BodyAnalysisCard.jsx'
import ProgressPhotoEmptyState from './ProgressPhotoEmptyState.jsx'
import ProgressPhotoUpload from './ProgressPhotoUpload.jsx'
import { readStorage } from '../services/appStorageService.js'
import {
  buildProgressPhotoComparison,
  buildProgressPhotoInsights,
  filterProgressPhotos,
  progressPhotoFilters,
  sortProgressPhotosChronologically,
} from '../services/progressPhotos.js'

const bodyAnalysisHistoryKey = 'viktkollen.bodyAnalysis.history'
const bodyAnalysisLegacyKey = 'viktkollen.bodyAnalysis.latest'

const swedishMonthNumbers = {
  apr: 3,
  april: 3,
  aug: 7,
  augusti: 7,
  dec: 11,
  december: 11,
  feb: 1,
  februari: 1,
  jan: 0,
  januari: 0,
  juli: 6,
  juni: 5,
  maj: 4,
  mars: 2,
  nov: 10,
  november: 10,
  okt: 9,
  oktober: 9,
  sep: 8,
  sept: 8,
  september: 8,
}

function getDaysSinceLabel(createdAtLabel) {
  const match = createdAtLabel
    .toLocaleLowerCase('sv-SE')
    .replace('.', '')
    .match(/(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})/)

  if (!match) {
    return ''
  }

  const day = Number(match[1])
  const month = swedishMonthNumbers[match[2]]
  const year = Number(match[3])

  if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year)) {
    return ''
  }

  const today = new Date()
  const photoDate = new Date(year, month, day)
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )
  const daysSince = Math.max(
    0,
    Math.floor((todayDate - photoDate) / 86400000),
  )

  if (daysSince === 0) {
    return 'Sparad idag'
  }

  return `${daysSince} dag${daysSince === 1 ? '' : 'ar'} sedan`
}

function getProgressPhotoTimelineLabel(index) {
  if (index === 0) {
    return 'Senaste'
  }

  if (index === 1) {
    return 'Föregående'
  }

  return ''
}

function getSameOccasionComparison(progressPhotoItems) {
  const photosByDate = progressPhotoItems.reduce((groups, photo) => {
    const currentGroup = groups[photo.createdAtLabel] || {}

    if (photo.viewLabel === 'Framifrån') {
      currentGroup.front = photo
    }

    if (photo.viewLabel === 'Från sidan') {
      currentGroup.side = photo
    }

    return {
      ...groups,
      [photo.createdAtLabel]: currentGroup,
    }
  }, {})

  return Object.values(photosByDate).find((group) => group.front && group.side)
}

function hasStoredBodyAnalyses() {
  const storedHistory = readStorage(bodyAnalysisHistoryKey, null)

  if (storedHistory) {
    return Array.isArray(storedHistory) && storedHistory.length > 0
  }

  return Boolean(readStorage(bodyAnalysisLegacyKey, null))
}

function ProgressPhotos({
  afterPhotoId,
  beforePhotoId,
  bodyAnalysisHistory = [],
  hasProgressPhotos,
  onAfterPhotoIdChange,
  onDeleteProgressPhoto,
  onBeforePhotoIdChange,
  onProgressPhotoChange,
  onProgressPhotoNoteChange,
  onUpdateProgressPhoto,
  progressPhotoComparison,
  progressPhotoComparisonImages,
  progressPhotoCountLabel,
  progressPhotoItems,
  progressPhotoNote,
  progressPhotoOptions,
  profile = {},
  showBodyAnalysis = true,
  userId,
  weights = [],
}) {
  const [showSameOccasionComparison, setShowSameOccasionComparison] =
    useState(false)
  const [photoFilter, setPhotoFilter] = useState('Alla')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [photoSearch, setPhotoSearch] = useState('')
  const [sliderPosition, setSliderPosition] = useState(50)
  const [hasBodyAnalysisHistory, setHasBodyAnalysisHistory] = useState(() =>
    hasStoredBodyAnalyses(),
  )
  const sameOccasionComparison = getSameOccasionComparison(progressPhotoItems)
  const comparison = buildProgressPhotoComparison({
    afterPhotoId,
    beforePhotoId,
    photos: progressPhotoItems,
  })
  const insights = buildProgressPhotoInsights(progressPhotoItems, comparison)
  const visiblePhotos = sortProgressPhotosChronologically(filterProgressPhotos(progressPhotoItems, periodFilter))
    .filter((photo) => {
    const matchesView = photoFilter === 'Alla' || photo.viewLabel === photoFilter
    const matchesSearch = [photo.note, photo.createdAtLabel, photo.weightLabel]
      .join(' ')
      .toLocaleLowerCase('sv-SE')
      .includes(photoSearch.trim().toLocaleLowerCase('sv-SE'))

    return matchesView && matchesSearch
  })
  const storageSizeKb = Math.ceil(
    progressPhotoItems.reduce((sum, photo) => sum + String(photo.image || '').length, 0) / 1024,
  )

  return (
    <article className="panel photos-panel" id="framstegsbilder">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Framstegsbilder V2</p>
          <h2>Framstegsbilder</h2>
        </div>
      </div>

      <ProgressPhotoUpload
        onProgressPhotoChange={onProgressPhotoChange}
        onProgressPhotoNoteChange={onProgressPhotoNoteChange}
        progressPhotoNote={progressPhotoNote}
      />

      {showBodyAnalysis && (
      <BodyAnalysisCard
        bodyAnalysisHistoryContext={bodyAnalysisHistory}
        onAnalysisHistoryChange={setHasBodyAnalysisHistory}
        profile={profile}
        userId={userId}
        weights={weights}
      />
      )}

      {hasProgressPhotos && (
        <>
          <p className="progress-photo-safety">
            Bra! Försök ta nästa bild om ungefär en vecka för en rättvis
            jämförelse.
          </p>

          {progressPhotoComparison && (
            <div className="progress-photo-ai-comparison">
              <div className="progress-photo-ai-heading">
                <div>
                  <p className="eyebrow">AI Framstegsbilder V2</p>
                  <h3>Försiktig jämförelse</h3>
                </div>
                <span>{progressPhotoComparison.viewLabel}</span>
              </div>

              <p>{progressPhotoComparison.summary}</p>

              <div className="progress-photo-ai-images">
                {progressPhotoComparisonImages.map((photo) => (
                  <figure key={photo.id}>
                    <img src={photo.image} alt={photo.alt} />
                    <figcaption>{photo.caption}</figcaption>
                  </figure>
                ))}
              </div>

              <ul>
                {progressPhotoComparison.observations.map((observation) => (
                  <li key={observation}>{observation}</li>
                ))}
              </ul>

              <p className="progress-photo-ai-safety">
                Observationerna är försiktiga och lokala. Ingen medicinsk
                diagnos, kroppsfettprocent, viktuppskattning eller
                hälsobedömning görs.
              </p>
            </div>
          )}

          <div className="progress-photo-history-heading">
            <div>
              <strong>Bildhistorik</strong>
              <span>{progressPhotoCountLabel} · cirka {storageSizeKb.toLocaleString('sv-SE')} kB lokalt</span>
            </div>
            <span className="progress-photo-local-badge">Endast lokalt</span>
          </div>

          <section className="progress-photo-v2-summary" aria-label="Progress photo-insikter">
            <div><span>Antal bilder</span><strong>{insights.photoCount}</strong></div>
            <div><span>Tidsperiod</span><strong>{insights.periodLabel}</strong></div>
            <div><span>Vald viktförändring</span><strong>{insights.selectedWeightChangeLabel}</strong></div>
          </section>

          <p className="progress-photo-safety">
            Bilderna hanteras enligt appens befintliga lokala lagringsflöde.
            Inga externa bild-API:er används för den här jämförelsen.
          </p>

          <div className="progress-photo-filters">
            <div className="progress-photo-period-filter" aria-label="Filtrera tidsperiod">
              {progressPhotoFilters.map((filter) => (
                <button
                  aria-pressed={periodFilter === filter.id}
                  className={periodFilter === filter.id ? 'active' : ''}
                  key={filter.id}
                  type="button"
                  onClick={() => setPeriodFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Filtrera vy</span>
              <select value={photoFilter} onChange={(event) => setPhotoFilter(event.target.value)}>
                <option>Alla</option>
                <option>Framifrån</option>
                <option>Från sidan</option>
                <option>Bakifrån</option>
                <option>Annan vy</option>
              </select>
            </label>
            <label className="field">
              <span>Sök anteckning</span>
              <input
                type="search"
                value={photoSearch}
                onChange={(event) => setPhotoSearch(event.target.value)}
                placeholder="Sök i anteckningar"
              />
            </label>
          </div>

          <div className="photo-timeline">
            {visiblePhotos.length === 0 && (
              <div className="progress-empty">
                <strong>Inga bilder matchar filtren.</strong>
                <span>Justera vy eller sökning för att se fler bilder.</span>
              </div>
            )}
            {visiblePhotos.map((photo, index) => {
              const timelineLabel = getProgressPhotoTimelineLabel(index)
              const daysSinceLabel = getDaysSinceLabel(photo.createdAtLabel)

              return (
              <article key={photo.id}>
                <img src={photo.image} alt={photo.alt} />
                <div>
                  {timelineLabel && (
                    <span className="progress-photo-view-badge">
                      {timelineLabel}
                    </span>
                  )}
                  <span className="progress-photo-view-badge">
                    {photo.viewLabel}
                  </span>
                  <strong>{photo.createdAtLabel}</strong>
                  {daysSinceLabel && <span>{daysSinceLabel}</span>}
                  <span>{photo.weightLabel}</span>
                  <span>{photo.note}</span>
                  <div className="progress-photo-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        const note = window.prompt('Uppdatera anteckning', photo.note)

                        if (note !== null) {
                          onUpdateProgressPhoto(photo.id, { note })
                        }
                      }}
                    >
                      Redigera
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => window.open(photo.image, '_blank', 'noopener,noreferrer')}
                    >
                      Öppna stort
                    </button>
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      onClick={() => onDeleteProgressPhoto(photo.id)}
                    >
                      Ta bort
                    </button>
                  </div>
                </div>
              </article>
              )
            })}
          </div>

          {sameOccasionComparison && (
            <div className="progress-photo-compare-preview">
              <button
                type="button"
                onClick={() => setShowSameOccasionComparison(true)}
              >
                Jämför bilder
              </button>
              {showSameOccasionComparison && (
                <div className="before-after">
                  {[sameOccasionComparison.front, sameOccasionComparison.side].map(
                    (photo) => (
                      <figure key={photo.id}>
                        <img src={photo.image} alt={photo.alt} />
                        <figcaption>
                          {photo.viewLabel} · {photo.createdAtLabel}
                        </figcaption>
                      </figure>
                    ),
                  )}
                </div>
              )}
            </div>
          )}

          <details className="progress-photo-compare-preview">
            <summary>Progress Photos V2 före/efter</summary>
            <p>
              Välj två befintliga bilder och jämför datum, vikt och anteckning.
              Sammanfattningen bygger bara på sparad metadata.
            </p>
            <div className="comparison-controls">
              <label className="field">
                <span>Före</span>
                <select
                  value={beforePhotoId}
                  onChange={(event) => onBeforePhotoIdChange(event.target.value)}
                >
                  {progressPhotoOptions.map((photo) => (
                    <option value={photo.id} key={photo.id}>
                      {photo.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Efter</span>
                <select
                  value={afterPhotoId}
                  onChange={(event) => onAfterPhotoIdChange(event.target.value)}
                >
                  {progressPhotoOptions.map((photo) => (
                    <option value={photo.id} key={photo.id}>
                      {photo.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="before-after">
              {[comparison.before, comparison.after].filter(Boolean).map((photo, index) => (
                <figure key={`${photo.id}-${index}`}>
                  <img src={photo.image} alt={photo.alt} />
                  <figcaption>
                    {index === 0 ? 'Före' : 'Efter'} · {photo.createdAtLabel}
                    <span>{photo.weightLabel}</span>
                    <span>{photo.note}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
            {comparison.hasBoth && (
              <div className="progress-photo-slider">
                <div
                  className="progress-photo-slider-frame"
                  style={{ '--progress-photo-slider': `${sliderPosition}%` }}
                >
                  <img src={comparison.before.image} alt="Förebild i slider" />
                  <img src={comparison.after.image} alt="Efterbild i slider" />
                </div>
                <label className="field">
                  <span>Jämförelseläge</span>
                  <input
                    aria-label="Justera före efter-slider"
                    max="100"
                    min="0"
                    type="range"
                    value={sliderPosition}
                    onChange={(event) => setSliderPosition(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
          </details>
        </>
      )}

      {!hasProgressPhotos && (!showBodyAnalysis || !hasBodyAnalysisHistory) && (
        <ProgressPhotoEmptyState />
      )}
    </article>
  )
}

export default ProgressPhotos
