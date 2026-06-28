import WeightSummary from './WeightSummary.jsx'

function WeightChart({
  averageWeeklyChangeLabel,
  chartHeight,
  chartPadding,
  chartPoints,
  chartRange,
  chartRangeOptions,
  chartWeights,
  chartWidth,
  endDateLabel,
  onChartRangeChange,
  startDateLabel,
  trendPoints,
}) {
  return (
    <div className="chart-card">
      <WeightSummary
        averageWeeklyChangeLabel={averageWeeklyChangeLabel}
        chartRange={chartRange}
        chartRangeOptions={chartRangeOptions}
        onChartRangeChange={onChartRangeChange}
      />

      <div className="weight-chart" aria-label="Viktgraf med trendlinje">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img">
          <title>Viktutveckling</title>
          <line
            x1={chartPadding}
            y1={chartPadding}
            x2={chartPadding}
            y2={chartHeight - chartPadding}
          />
          <line
            x1={chartPadding}
            y1={chartHeight - chartPadding}
            x2={chartWidth - chartPadding}
            y2={chartHeight - chartPadding}
          />
          <polyline className="trend-line" points={trendPoints.join(' ')} />
          <polyline className="weight-line" points={chartPoints.join(' ')} />
          {chartPoints.map((point, index) => {
            const [cx, cy] = point.split(',')

            return (
              <circle
                key={`${chartWeights[index].date}-${chartWeights[index].value}`}
                cx={cx}
                cy={cy}
                r="4.5"
              />
            )
          })}
        </svg>
      </div>

      <div className="chart-footer">
        <span>{startDateLabel}</span>
        <span>{endDateLabel}</span>
      </div>
    </div>
  )
}

export default WeightChart
