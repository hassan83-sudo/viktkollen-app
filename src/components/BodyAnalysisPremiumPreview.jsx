function BodyAnalysisPremiumPreview({
  analysisCount,
  isPremiumPreviewEnabled,
  localLimit,
  onTogglePremiumPreview,
}) {
  const remainingAnalyses = Math.max(0, localLimit - analysisCount)

  return (
    <div className="body-analysis-recommended-steps">
      <div>
        <p className="eyebrow">Premiumförhandsvisning</p>
        <h3>
          {isPremiumPreviewEnabled
            ? 'Premium-demo är aktiv'
            : 'AI-kroppsanalys premium'}
        </h3>
      </div>
      <p>
        Gratisläget sparar upp till {localLimit} lokala analyser. Du har{' '}
        {remainingAnalyses} kvar innan premiumläget behöver låsas upp senare.
      </p>
      <ul>
        <li>AI-kroppsanalys med två bildvinklar.</li>
        <li>Historik över tid med lokala analyser.</li>
        <li>Jämförelse mellan analyser.</li>
        <li>Export och import av analystidslinjen.</li>
        <li>Framtida molnsynk när konto och databas kopplas in.</li>
      </ul>
      <button
        className="secondary-button"
        type="button"
        aria-label={
          isPremiumPreviewEnabled
            ? 'Stäng av premiumförhandsvisning'
            : 'Aktivera premiumförhandsvisning'
        }
        onClick={onTogglePremiumPreview}
      >
        {isPremiumPreviewEnabled
          ? 'Stäng premiumförhandsvisning'
          : 'Förhandsvisa premiumläge'}
      </button>
    </div>
  )
}

export default BodyAnalysisPremiumPreview
