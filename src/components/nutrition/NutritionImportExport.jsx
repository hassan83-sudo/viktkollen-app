function NutritionImportExport({ fileInputRef, importStatus, onExport, onFileChange, onOpenImport }) {
  return (
    <section className="nutrition-card nutrition-import-export">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Din kostdata</p>
          <h3>Spara eller återställ dina kostuppgifter</h3>
        </div>
      </div>
      <p className="settings-note">
        Skapa en säkerhetskopia av måltider, kostmål, favoriter, mallar, recept och matpreferenser, eller återställ från en tidigare sparad fil.
      </p>
      <div className="nutrition-actions">
        <button type="button" onClick={onExport}>Spara kostdata</button>
        <button className="secondary-button" type="button" onClick={onOpenImport}>Välj säkerhetskopia</button>
        <input
          ref={fileInputRef}
          aria-label="Välj säkerhetskopia med kostdata"
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
        />
      </div>
      <details className="nutrition-technical-details">
        <summary>Teknisk information</summary>
        <p>Filen innehåller kostdata utan auth, sessioner, tokens, blobbar eller bild-base64.</p>
      </details>
      {importStatus && <p className="analysis-status" role="status" aria-live="polite">{importStatus}</p>}
    </section>
  )
}

export default NutritionImportExport
