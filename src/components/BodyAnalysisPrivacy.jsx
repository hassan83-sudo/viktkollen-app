function BodyAnalysisPrivacy({ showConsent, onApprove, onCancel }) {
  return (
    <>
      <p className="progress-photo-safety">
        Bilderna skickas till AI-analysen när du klickar på Analysera kroppen.
        Bilderna sparas inte permanent i appen. Resultatet är endast en allmän
        uppskattning och ingen medicinsk diagnos.
      </p>
      <p className="progress-photo-safety">
        Historiken sparas lokalt på denna enhet. Molnsynk kan läggas till
        senare.
      </p>
      {showConsent && (
        <div className="progress-photo-ai-comparison">
          <div className="progress-photo-ai-heading">
            <div>
              <p className="eyebrow">Bekräfta analys</p>
              <h3>Skicka bilder till AI-analysen?</h3>
            </div>
            <span>Integritet</span>
          </div>
          <p>
            Bilderna används bara för att skapa analysresultatet i denna version
            och sparas inte permanent i appen. Resultatet är en allmän
            uppskattning och inte medicinsk rådgivning.
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
