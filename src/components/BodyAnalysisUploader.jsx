function BodyAnalysisUploader({
  canAnalyze,
  currentAnalysisStatus,
  frontPhoto,
  onAnalyze,
  onPhotoChange,
  sidePhoto,
}) {
  return (
    <>
      <div className="progress-photo-upload-grid">
        <label className="progress-photo-upload-card">
          <span className="progress-photo-icon" aria-hidden="true">
            F
          </span>
          <strong>Bild framifrån</strong>
          <small>Välj en bild för framtida kroppsanalys.</small>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => onPhotoChange(event, 'front')}
          />
        </label>
        <label className="progress-photo-upload-card">
          <span className="progress-photo-icon" aria-hidden="true">
            S
          </span>
          <strong>Bild från sidan</strong>
          <small>Välj en sidobild för framtida jämförelse.</small>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => onPhotoChange(event, 'side')}
          />
        </label>
      </div>
      {(frontPhoto || sidePhoto) && (
        <div className="progress-photo-ai-images">
          {frontPhoto && (
            <figure>
              <img src={frontPhoto.preview} alt="Vald bild framifrån" />
              <figcaption>{frontPhoto.name}</figcaption>
            </figure>
          )}
          {sidePhoto && (
            <figure>
              <img src={sidePhoto.preview} alt="Vald bild från sidan" />
              <figcaption>{sidePhoto.name}</figcaption>
            </figure>
          )}
        </div>
      )}
      <button type="button" onClick={onAnalyze} disabled={!canAnalyze}>
        Analysera kroppen
      </button>
      <p className="analysis-status">{currentAnalysisStatus}</p>
    </>
  )
}

export default BodyAnalysisUploader
