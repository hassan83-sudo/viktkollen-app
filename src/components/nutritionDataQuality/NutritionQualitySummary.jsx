function NutritionQualitySummary({ quality, title = 'Datakvalitet' }) {
  if (!quality) return null

  const rows = [
    ['Analyserbart', quality.analyzedCoverage],
    ['Protein', quality.macroCoverage?.protein?.label],
    ['Kalorier', quality.macroCoverage?.calories?.label],
    ['Bekräftat/användarangivet', `${quality.userVerifiedMealCount ?? quality.manualMealCount ?? 0} måltider`],
    ['AI-estimat', `${quality.aiEstimatedMealCount || 0} måltider`],
    ['Behöver granskas', `${quality.reviewMealCount || 0} måltider`],
  ]

  return (
    <section className="nutrition-card nutrition-quality-summary" aria-labelledby="nutrition-quality-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Underlag</p>
          <h3 id="nutrition-quality-title">{title}</h3>
        </div>
      </div>
      <div className="nutrition-quality-grid">
        {rows.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value || 'Saknas'}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

export default NutritionQualitySummary
