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
      </div>
      <p className="progress-photo-safety">
        Bilderna sparas bara lokalt i webbläsaren. Funktionen gör ingen
        medicinsk diagnos, kroppsfettanalys eller viktuppskattning.
      </p>
    </div>
  )
}

export default ProgressPhotoUpload
