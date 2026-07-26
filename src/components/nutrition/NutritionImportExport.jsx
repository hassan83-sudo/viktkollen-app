function NutritionImportExport({ fileInputRef, importStatus, onExport, onFileChange, onOpenImport }) {
  return (
    <section className="nutrition-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Import/export</p>
          <h3>Kostdata JSON</h3>
        </div>
      </div>
      <p className="settings-note">
        Exporten innehåller måltider, kostmål och favoriter. Auth, sessioner och tokens ingår aldrig.
      </p>
      <div className="nutrition-actions">
        <button type="button" onClick={onExport}>Exportera kostdata</button>
        <button className="secondary-button" type="button" onClick={onOpenImport}>Importera JSON</button>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
        />
      </div>
      {importStatus && <p className="analysis-status">{importStatus}</p>}
    </section>
  )
}

export default NutritionImportExport
