function BodyAnalysisQuality({ items }) {
  return (
    <div className="body-analysis-progress">
      <div>
        <p className="eyebrow">Analyskvalitet</p>
        <h3>För bättre jämförelser</h3>
      </div>
      <div className="body-analysis-progress-grid">
        {items.map((item) => (
          <div key={item.label}>
            <span
              className={`body-analysis-status-dot is-${item.status}`}
              aria-hidden="true"
            />
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BodyAnalysisQuality
