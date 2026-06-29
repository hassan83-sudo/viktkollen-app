function BodyAnalysisUnlockCard({ isLimitReached, isPremiumPreviewEnabled }) {
  if (!isLimitReached || isPremiumPreviewEnabled) {
    return null
  }

  return (
    <div className="progress-photo-ai-comparison">
      <div className="progress-photo-ai-heading">
        <div>
          <p className="eyebrow">Lås upp senare</p>
          <h3>Gratisgränsen är nådd</h3>
        </div>
        <span>Förberett</span>
      </div>
      <p>
        Du har skapat tre lokala analyser i gratisläget. Senare kan premium
        låsa upp fler analyser, längre historik och molnsynk. Ingen betalning
        är kopplad i den här versionen.
      </p>
    </div>
  )
}

export default BodyAnalysisUnlockCard
