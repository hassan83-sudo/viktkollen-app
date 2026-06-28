function WeightSummary({
  averageWeeklyChangeLabel,
  chartRange,
  chartRangeOptions,
  onChartRangeChange,
}) {
  return (
    <div className="chart-toolbar">
      <div>
        <span>Genomsnitt per vecka</span>
        <strong>{averageWeeklyChangeLabel}</strong>
      </div>
      <div className="segmented-control" aria-label="Välj tidsperiod">
        {chartRangeOptions.map((option) => (
          <button
            className={chartRange === option.value ? 'active' : ''}
            type="button"
            key={option.value}
            onClick={() => onChartRangeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default WeightSummary
