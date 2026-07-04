/**
 * Generates suggested AI questions from the shared user context.
 *
 * @param {object} userContext
 * @returns {string[]}
 */
export function createAiSuggestions(userContext = {}) {
  const suggestions = [
    'Vad ska jag äta ikväll?',
    'Hur mycket har jag gått ner?',
    'Hur ligger jag till den här veckan?',
    'Hur mycket protein behöver jag?',
    'Hur ser min utveckling ut?',
    'Vad ska jag fokusera på idag?',
  ]

  if (!userContext.weight?.currentWeight) {
    suggestions.push('Hur börjar jag logga vikten smart?')
  }

  if ((userContext.meals?.totalAnalyses || 0) === 0) {
    suggestions.push('Hur kan jag förbättra nästa måltid?')
  }

  return suggestions.slice(0, 8)
}
