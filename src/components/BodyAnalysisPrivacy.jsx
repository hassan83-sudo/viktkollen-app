function BodyAnalysisPrivacy({ showConsent, onApprove, onCancel }) {
  return (
    <>
      <p className="progress-photo-safety">
        Bilderna skickas till AI-analysen när du klickar på Analysera kroppen.
        Originalvideo sparas inte. Analysen använder tre stillbilder.
        Resultatet är endast en allmän uppskattning och ingen medicinsk diagnos.
      </p>
      <p className="progress-photo-safety">
        Historiken sparas lokalt på denna enhet och kan innehålla bildförhandsvisningar.
        Molnlagring för kroppsbilder är inte implementerad.
      </p>
      {showConsent && (
        <div className="progress-photo-ai-comparison body-scan-consent-overlay">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Bekräfta analys</p>
              <h3>Skicka bilder till AI-analysen?</h3>
            </div>
            <span>Integritet</span>
          </div>
          <p>
            Bilderna används bara för att skapa analysresultatet i denna version.
            Originalvideo sparas inte. Lokal historik kan innehålla stillbildsförhandsvisningar.
            Resultatet är en allmän uppskattning och inte medicinsk rådgivning.
          </p>
          <button
            type="button"
            aria-label="Godkänn och starta AI-kroppsanalys"
            onClick={onApprove}
          >
            Jag godkänner och analyserar
          </button>
          <button
            className="secondary-button"
            type="button"
            aria-label="Avbryt AI-kroppsanalys"
            onClick={onCancel}
          >
            Avbryt
          </button>
        </div>
      )}
    </>
  )
}

export default BodyAnalysisPrivacy
