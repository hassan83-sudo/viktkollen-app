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
  return (
    <article className="panel photos-panel" id="framstegsbilder">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Framstegsbilder V2</p>
          <h2>Framstegsbilder</h2>
        </div>
      </div>

      <div className="progress-upload">
        <label className="field">
          <span>Anteckning</span>
          <input
            type="text"
            placeholder="Exempel: morgon, efter pass, vecka 1"
            value={progressPhotoNote}
            onChange={(event) => onProgressPhotoNoteChange(event.target.value)}
          />
        </label>
        <div className="progress-photo-upload-grid">
          <label className="progress-photo-upload-card">
            <span className="progress-photo-icon" aria-hidden="true">
              F
            </span>
            <strong>Framifrån</strong>
            <small>Ta en ny bild eller välj från mobilen.</small>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => onProgressPhotoChange(event, 'front')}
            />
          </label>
          <label className="progress-photo-upload-card">
            <span className="progress-photo-icon" aria-hidden="true">
              S
            </span>
            <strong>Från sidan</strong>
            <small>Ta en ny bild eller välj från mobilen.</small>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => onProgressPhotoChange(event, 'side')}
            />
          </label>
        </div>
        <p className="progress-photo-safety">
          Bilderna sparas bara lokalt i webbläsaren. Funktionen gör ingen
          medicinsk diagnos, kroppsfettanalys eller viktuppskattning.
        </p>
      </div>

      {hasProgressPhotos && (
        <>
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
            {progressPhotoItems.map((photo) => (
              <article key={photo.id}>
                <img src={photo.image} alt={photo.alt} />
                <div>
                  <span className="progress-photo-view-badge">
                    {photo.viewLabel}
                  </span>
                  <strong>{photo.createdAtLabel}</strong>
                  <span>{photo.note}</span>
                </div>
              </article>
            ))}
          </div>

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

      {!hasProgressPhotos && (
        <div className="progress-photo-empty">
          <strong>Ingen bildhistorik ännu</strong>
          <span>
            Börja med en bild framifrån eller från sidan. Du väljer själv
            när du vill lägga till nästa.
          </span>
        </div>
      )}
    </article>
  )
}

export default ProgressPhotos
