function getReportText(weeklyReportLines) {
  return weeklyReportLines
    .map((line) => line.text)
    .join(' ')
    .toLocaleLowerCase('sv-SE')
}

function getReportValue(weeklyReportLines, label) {
  return weeklyReportLines.find((line) =>
    line.text.toLocaleLowerCase('sv-SE').includes(label),
  )?.text
}

function getNumberFromText(text) {
  const match = text?.match(/-?\d+(?:[,.]\d+)?/)

  return match ? Number(match[0].replace(',', '.')) : null
}

function limitItems(items, fallback) {
  const uniqueItems = [...new Set(items.filter(Boolean))]

  return (uniqueItems.length ? uniqueItems : fallback).slice(0, 2)
}

function makeWeeklyStrengths(reportText, weeklyReportLines) {
  const strengths = []
  const foodLine = getReportValue(weeklyReportLines, 'matchecklista')
  const stepsLine = getReportValue(weeklyReportLines, 'snittsteg')
  const energyLine = getReportValue(weeklyReportLines, 'energi')
  const mealsLine = weeklyReportLines.find((line) =>
    line.text.toLocaleLowerCase('sv-SE').includes('måltider är loggade'),
  )?.text
  const foodPercent = getNumberFromText(foodLine)
  const steps = getNumberFromText(stepsLine)

  if (foodPercent !== null && foodPercent >= 50) {
    strengths.push('Matchecklistan har en bra grund.')
  }

  if (steps !== null && steps >= 5000) {
    strengths.push('Vardagsrörelsen finns på plats.')
  }

  if (reportText.includes('vikttrend') || reportText.includes('viktförändring')) {
    strengths.push('Vikttrenden går att följa bättre nu.')
  }

  if (energyLine || reportText.includes('energin ser stabil')) {
    strengths.push('Energi och dagsform ger bra vägledning.')
  }

  if (mealsLine) {
    strengths.push('Måltidsloggen ger bättre underlag.')
  }

  return limitItems(strengths, [
    'Du har en tydlig startpunkt.',
    'Datan gör nästa vecka lättare att styra.',
  ])
}

function makeImprovements(reportText, weeklyReportLines) {
  const foodLine = getReportValue(weeklyReportLines, 'matchecklista')
  const stepsLine = getReportValue(weeklyReportLines, 'snittsteg')
  const foodPercent = getNumberFromText(foodLine)
  const steps = getNumberFromText(stepsLine)
  const improvements = []

  if (foodPercent !== null && foodPercent < 75) {
    improvements.push('Välj en matpunkt att upprepa dagligen.')
  }

  if (steps !== null && steps < 7000) {
    improvements.push('Lägg en kort promenad på en fast tid.')
  }

  if (reportText.includes('ingen träning')) {
    improvements.push('Planera ett lätt pass eller en längre promenad.')
  }

  if (reportText.includes('inte tillräckligt med data')) {
    improvements.push('Logga några fler vägningar för säkrare trend.')
  }

  if (improvements.length < 2) {
    improvements.push('Fortsätt logga måltider när det passar.')
  }

  if (improvements.length < 2) {
    improvements.push('Upprepa en liten vana innan du höjer nivån.')
  }

  return limitItems(improvements, [
    'Välj en liten vana att upprepa.',
    'Fortsätt samla data utan att krångla till det.',
  ])
}

function makeNextFocus(reportText, weeklyReportLines) {
  const foodLine = getReportValue(weeklyReportLines, 'matchecklista')
  const stepsLine = getReportValue(weeklyReportLines, 'snittsteg')
  const foodPercent = getNumberFromText(foodLine)
  const steps = getNumberFromText(stepsLine)

  if (foodPercent !== null && foodPercent < 75) {
    return 'Säkra en enkel protein- eller grönsakspunkt varje dag.'
  }

  if (steps !== null && steps < 7000) {
    return 'Ta en kort promenad varje dag.'
  }

  if (reportText.includes('inte tillräckligt med data')) {
    return 'Logga vikt och måltider regelbundet.'
  }

  return 'Behåll basen och förbättra en vana i taget.'
}

function makeCoachSummary(reportText, weeklyReportLines) {
  const trendLine = getReportValue(weeklyReportLines, 'vikttrend')
  const foodLine = getReportValue(weeklyReportLines, 'matchecklista')
  const stepsLine = getReportValue(weeklyReportLines, 'snittsteg')
  const summary = []

  if (trendLine && !reportText.includes('inte tillräckligt med data')) {
    summary.push('Titta på riktningen över veckan, inte en enskild dag.')
  } else {
    summary.push('Mer loggning gör nästa rapport tydligare.')
  }

  if (foodLine || stepsLine) {
    summary.push('Matchecklista och steg är de enklaste reglagen att justera.')
  } else {
    summary.push('Håll nästa vecka enkel och mätbar.')
  }

  return summary
}

function makeEnhancedSections(weeklyReportLines) {
  const reportText = getReportText(weeklyReportLines)

  return [
    {
      heading: 'Veckans styrkor',
      items: makeWeeklyStrengths(reportText, weeklyReportLines),
    },
    {
      heading: 'Kan förbättras',
      items: makeImprovements(reportText, weeklyReportLines),
    },
    {
      heading: 'Nästa veckas fokus',
      items: [makeNextFocus(reportText, weeklyReportLines)],
    },
    {
      heading: 'AI Coachs sammanfattning',
      items: makeCoachSummary(reportText, weeklyReportLines),
    },
  ]
}

function WeeklyReport({
  onCreateWeeklyReport,
  weeklyReportLines,
  weeklyReportStatus,
}) {
  const enhancedSections = weeklyReportLines.length > 0
    ? makeEnhancedSections(weeklyReportLines)
    : []

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
          {enhancedSections.map((section) => (
            <div key={section.heading}>
              <p className="report-heading">{section.heading}</p>
              {section.items.map((item) => (
                <p key={`${section.heading}-${item}`}>• {item}</p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default WeeklyReport
