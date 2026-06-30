const reportSections = [
  ['summary', 'Veckans sammanfattning'],
  ['weightTrend', 'Vikttrend'],
  ['mealPattern', 'Matmönster'],
  ['nutritionStatus', 'Protein/grönsaksstatus'],
  ['movement', 'Rörelse/steg'],
  ['recovery', 'Återhämtning'],
  ['biggestProgress', 'Största framsteg'],
  ['biggestRisk', 'Största risk'],
  ['focusNextWeek', 'Fokus för nästa vecka'],
]

function LegacyReport({ weeklyReportLines }) {
  if (weeklyReportLines.length === 0) {
    return null
  }

  return (
    <>
      {weeklyReportLines.map((line) => (
        <p className={line.isHeading ? 'report-heading' : ''} key={line.id}>
          {line.text}
        </p>
      ))}
    </>
  )
}

function WeeklyReport({
  onCreateWeeklyReport,
  weeklyReportData,
  weeklyReportLines,
  weeklyReportStatus,
}) {
  const hasStructuredReport = Boolean(weeklyReportData)

  return (
    <div className="weekly-report">
      <button type="button" onClick={onCreateWeeklyReport}>
        Skapa AI-veckorapport
      </button>
      {weeklyReportStatus && (
        <p className="analysis-status">{weeklyReportStatus}</p>
      )}
      {(hasStructuredReport || weeklyReportLines.length > 0) && (
        <div className="report-card">
          {hasStructuredReport ? (
            <>
              {reportSections.map(([key, heading]) => (
                <div key={key}>
                  <p className="report-heading">{heading}</p>
                  <p>{weeklyReportData[key]}</p>
                </div>
              ))}
              <div>
                <p className="report-heading">3 konkreta nästa steg</p>
                {(weeklyReportData.nextSteps || []).slice(0, 3).map((step) => (
                  <p key={step}>• {step}</p>
                ))}
              </div>
              <p className="estimate-note">
                Rapporten är allmänt stöd för hälsa och vanor, inte medicinsk
                rådgivning.
              </p>
            </>
          ) : (
            <LegacyReport weeklyReportLines={weeklyReportLines} />
          )}
        </div>
      )}
    </div>
  )
}

export default WeeklyReport
