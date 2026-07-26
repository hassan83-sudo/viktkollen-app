function ProgressPhotoUpload({
  onProgressPhotoChange,
  onProgressPhotoNoteChange,
  progressPhotoNote,
}) {
  return (
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
        <label className="progress-photo-upload-card">
          <span className="progress-photo-icon" aria-hidden="true">
            B
          </span>
          <strong>Bakifrån</strong>
          <small>Valfri extra vy för tydligare lokal historik.</small>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => onProgressPhotoChange(event, 'back')}
          />
        </label>
        <label className="progress-photo-upload-card">
          <span className="progress-photo-icon" aria-hidden="true">
            A
          </span>
          <strong>Annan vy</strong>
          <small>För en egen jämförelsevinkel eller särskild notering.</small>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => onProgressPhotoChange(event, 'other')}
          />
        </label>
      </div>
      <p className="progress-photo-safety">
        Bilderna sparas bara lokalt i webbläsaren. Funktionen gör ingen
        medicinsk diagnos, kroppsfettanalys eller viktuppskattning.
      </p>
    </div>
  )
}

export default ProgressPhotoUpload
