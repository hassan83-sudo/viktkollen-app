function WeeklyReport({
  onCreateWeeklyReport,
  weeklyReportLines,
  weeklyReportStatus,
}) {
  return (
    <div className="weekly-report">
      <button type="button" onClick={onCreateWeeklyReport}>
        Skapa veckorapport
      </button>
      {weeklyReportStatus && (
        <p className="analysis-status">{weeklyReportStatus}</p>
      )}
      {weeklyReportLines.length > 0 && (
        <div className="report-card">
          {weeklyReportLines.map((line) => (
            <p
              className={line.isHeading ? 'report-heading' : ''}
              key={line.id}
            >
              {line.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export default WeeklyReport
