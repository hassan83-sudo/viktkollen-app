/**
 * Gets a compact comparison object for the selected analysis.
 *
 * @param {object | null} analysis
 * @param {object[]} history
 * @returns {{better: string, nextFocus: string, unchanged: string}}
 */
export function getAnalysisComparison(analysis, history) {
  if (!analysis || history.length <= 1) {
    return {
      better: 'Det här är din första analys.',
      nextFocus: 'Skapa en ny analys om ungefär en vecka.',
      unchanged: 'Ingen tidigare analys finns att jämföra med ännu.',
    }
  }

  return {
    better:
      analysis.result?.comparison?.better ||
      'Fortsätt följa utvecklingen med samma bildrutin.',
    nextFocus:
      analysis.result?.comparison?.nextFocus ||
      'Ta nästa bild med samma ljus, avstånd och vinkel.',
    unchanged:
      analysis.result?.comparison?.unchanged ||
      'Vissa delar kan vara oförändrade mellan analyser.',
  }
}
