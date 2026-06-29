function BodyAnalysisUploader({
  canAnalyze,
  currentAnalysisStatus,
  disabledReason,
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
          <small>Välj en bild framifrån för kroppsanalysen.</small>
          <input
            type="file"
            accept="image/*"
            aria-label="Välj bild framifrån för AI-kroppsanalys"
            onChange={(event) => onPhotoChange(event, 'front')}
          />
        </label>
        <label className="progress-photo-upload-card">
          <span className="progress-photo-icon" aria-hidden="true">
            S
          </span>
          <strong>Bild från sidan</strong>
          <small>Välj en sidobild för jämförelse över tid.</small>
          <input
            type="file"
            accept="image/*"
            aria-label="Välj bild från sidan för AI-kroppsanalys"
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
      <button
        type="button"
        aria-label="Starta AI-kroppsanalys med valda bilder"
        onClick={onAnalyze}
        disabled={!canAnalyze}
      >
        Analysera kroppen
      </button>
      <p className="analysis-status">{currentAnalysisStatus}</p>
      {disabledReason && (
        <p className="progress-photo-safety">{disabledReason}</p>
      )}
    </>
  )
}

export default BodyAnalysisUploader
