function formatDate(date) {
  if (!date) {
    return '-'
  }

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

/**
 * Builds the "Utveckling över tid" card model.
 *
 * @param {object[]} history
 * @returns {Array<{label: string, value: string | number}>}
 */
export function getBodyAnalysisProgressStats(history) {
  const sortedHistory = [...history].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
  )
  const firstAnalysis = sortedHistory[0]
  const latestAnalysis = sortedHistory[sortedHistory.length - 1]
  const intervals = sortedHistory.slice(1).map((analysis, index) => {
    const currentTime = new Date(analysis.createdAt).getTime()
    const previousTime = new Date(sortedHistory[index].createdAt).getTime()

    return Math.abs(currentTime - previousTime) / (24 * 60 * 60 * 1000)
  })
  const averageInterval =
    intervals.length > 0
      ? Math.round(
          intervals.reduce((sum, interval) => sum + interval, 0) /
            intervals.length,
        )
      : null
  const aiCount = history.filter((analysis) => analysis.result?.source === 'ai')
    .length
  const mockCount = history.filter(
    (analysis) => analysis.result?.source === 'mock',
  ).length

  return [
    { label: 'Första analysdatum', value: formatDate(firstAnalysis?.createdAt) },
    { label: 'Senaste analysdatum', value: formatDate(latestAnalysis?.createdAt) },
    { label: 'Antal analyser', value: history.length },
    { label: 'AI/mock-fördelning', value: `${aiCount}/${mockCount}` },
    {
      label: 'Genomsnittligt intervall',
      value: averageInterval !== null ? `${averageInterval} dagar` : '-',
    },
    {
      label: 'Fokus denna månad',
      value: latestAnalysis?.result?.monthlyFocus || 'Skapa en jämn bildrutin.',
    },
    {
      label: 'Senaste sammanfattning',
      value: latestAnalysis?.result?.summary || 'Ingen analys ännu.',
    },
  ]
}
