function ReportTrendChart({ series }) {
  const width = 320
  const height = 120
  const padding = 16
  const pointsWithValues = series?.points?.filter((point) => Number.isFinite(point.value)) || []
  const values = pointsWithValues.map((point) => point.value)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const range = Math.max(max - min, 1)
  const points = pointsWithValues.map((point, index) => {
    const x = pointsWithValues.length === 1 ? width / 2 : padding + (index / Math.max(pointsWithValues.length - 1, 1)) * (width - padding * 2)
    const y = padding + ((max - point.value) / range) * (height - padding * 2)

    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <div className="report-trend-chart">
      {points.length >= 2 ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.textualSummary}>
          <title>{series.label}</title>
          <desc>{series.textualSummary}. Saknade buckets räknas inte som noll.</desc>
          <polyline points={points.join(' ')} />
        </svg>
      ) : (
        <div className="report-chart-empty">Fler datapunkter behövs för diagram.</div>
      )}
    </div>
  )
}

export default ReportTrendChart
