import { useState } from 'react'
import BodyAnalysisCard from './BodyAnalysisCard.jsx'
import ProgressPhotoEmptyState from './ProgressPhotoEmptyState.jsx'
import ProgressPhotoUpload from './ProgressPhotoUpload.jsx'

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
  try {
    const storedHistory = window.localStorage.getItem(bodyAnalysisHistoryKey)

    if (storedHistory) {
      const parsedHistory = JSON.parse(storedHistory)

      return Array.isArray(parsedHistory) && parsedHistory.length > 0
    }

    return Boolean(window.localStorage.getItem(bodyAnalysisLegacyKey))
  } catch {
    return false
  }
}

function ProgressPhotos({
  afterPhotoId,
  beforeAfterPhotos,
  beforePhotoId,
  hasProgressPhotos,
  onAfterPhotoIdChange,
  onBeforePhotoIdChange,
  onProgressPhotoChange,
  onProgressPhotoNoteChange,
  progressPhotoComparison,
  progressPhotoComparisonImages,
  progressPhotoCountLabel,
  progressPhotoItems,
  progressPhotoNote,
  progressPhotoOptions,
}) {
  const [showSameOccasionComparison, setShowSameOccasionComparison] =
    useState(false)
  const [hasBodyAnalysisHistory, setHasBodyAnalysisHistory] = useState(() =>
    hasStoredBodyAnalyses(),
  )
  const sameOccasionComparison = getSameOccasionComparison(progressPhotoItems)

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

      <BodyAnalysisCard
        onAnalysisHistoryChange={setHasBodyAnalysisHistory}
      />

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
              <span>{progressPhotoCountLabel}</span>
            </div>
            <span className="progress-photo-local-badge">Endast lokalt</span>
          </div>

          <div className="photo-timeline">
            {progressPhotoItems.map((photo, index) => {
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
                  <span>{photo.note}</span>
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
            <summary>Manuell före/efter-visning</summary>
            <p>
              Välj två bilder själv om du vill se dem bredvid varandra.
              AI V2 ovan jämför automatiskt nyaste bilden med föregående
              bild från samma perspektiv när det finns.
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
              {beforeAfterPhotos.map((photo) => (
                <figure key={photo.id}>
                  <img src={photo.image} alt={photo.alt} />
                  <figcaption>{photo.caption}</figcaption>
                </figure>
              ))}
            </div>
          </details>
        </>
      )}

      {!hasProgressPhotos && !hasBodyAnalysisHistory && (
        <ProgressPhotoEmptyState />
      )}
    </article>
  )
}

export default ProgressPhotos
