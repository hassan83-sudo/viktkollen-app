function BodyAnalysisPrivacy({ showConsent, onApprove, onCancel }) {
  return (
    <>
      <p className="progress-photo-safety">
        Bilderna skickas till AI-analysen när du klickar på Analysera kroppen.
        Originalvideo sparas inte. Analysen använder två stillbilder.
        Resultatet är endast en allmän uppskattning och ingen medicinsk diagnos.
      </p>
      <p className="progress-photo-safety">
        Historiken sparas lokalt på denna enhet och kan innehålla bildförhandsvisningar.
        Molnlagring för kroppsbilder är inte implementerad.
      </p>
      {showConsent && (
        <div className="progress-photo-ai-comparison body-scan-consent-overlay" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12, width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere' }}>
          <div className="progress-photo-ai-heading" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <div>
              <p className="eyebrow">Bekräfta analys</p>
              <h3 style={{ overflowWrap: 'anywhere' }}>Skicka bilder till AI-analysen?</h3>
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
            style={{ display: 'block', flex: '0 0 auto', width: '100%', minHeight: 48, height: 'auto', padding: '12px 16px', boxSizing: 'border-box' }}
            onClick={onApprove}
          >
            Jag godkänner och analyserar
          </button>
          <button
            className="secondary-button"
            type="button"
            aria-label="Avbryt AI-kroppsanalys"
            style={{ display: 'block', flex: '0 0 auto', width: '100%', minHeight: 48, height: 'auto', padding: '12px 16px', boxSizing: 'border-box' }}
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
