const intentKeywords = {
  bodyAnalysis: [
    'kroppsanalys',
    'kroppen',
    'framstegsbilder',
    'bildanalys',
    'hållning',
    'midja',
  ],
  calories: ['kalorier', 'kcal', 'energiintag', 'kalorimål'],
  checkIn: ['check-in', 'checkin', 'energi', 'humör', 'mående', 'steg idag'],
  food: ['mat', 'måltid', 'äta', 'middag', 'lunch', 'frukost', 'mellanmål'],
  goalWeight: [
    'målvikt',
    'målvikten',
    'mål vikt',
    'viktmål',
    'till mitt mål',
    'kvar till mål',
    'kvar till min målvikt',
    'till mål',
  ],
  habits: ['vana', 'vanor', 'rutiner', 'hälsovanor', 'checklista', 'vatten'],
  mealAnalysis: ['matanalys', 'matfoto', 'måltidsbild', 'bild på maten'],
  motivation: [
    'motivation',
    'orkar inte',
    'ge upp',
    'går dåligt',
    'misslyckades',
    'fuskat',
  ],
  protein: ['protein', 'proteinbehov', 'gram protein', 'proteinrik'],
  recipe: ['recept', 'laga', 'ingredienser', 'billig mat', 'matförslag'],
  sleep: ['sömn', 'sova', 'sover', 'läggdags', 'lägga mig', 'trött'],
  stress: ['stress', 'stressad', 'press', 'överväldigad', 'oro'],
  training: ['träning', 'träna', 'gym', 'promenad', 'pass', 'styrka', 'motion'],
  weeklyReport: ['veckorapport', 'rapport', 'veckan', 'sammanfattning'],
  weight: ['vikt', 'väger', 'gått ner', 'gått upp', 'viktnedgång', 'vikttrend'],
}

const followUpPhrases = [
  'då',
  'hur då',
  'hur mycket',
  'hur länge',
  'varför',
  'varför då',
  'vad menar du',
  'är det bra',
  'är det dåligt',
  'är det farligt',
  'är det skadligt',
]

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('sv-SE')
    .normalize('NFC')
}

function getLastUserMessage(chatHistory = []) {
  return [...chatHistory]
    .reverse()
    .find((message) => message?.role === 'user' && message?.text)
    ?.text
}

function getScore(text, keywords) {
  return keywords.reduce(
    (score, keyword) => score + (text.includes(keyword) ? 1 : 0),
    0,
  )
}

function isFollowUp(text) {
  return followUpPhrases.some((phrase) => text === phrase || text.includes(phrase))
}

/**
 * Classifies the user's AI coach message into a stable intent.
 *
 * @param {object} params
 * @param {string} params.message
 * @param {{role: string, text: string}[]} [params.chatHistory]
 * @returns {{intent: string, confidence: number, isFollowUp: boolean, matchedIntents: string[]}}
 */
export function classifyAiCoachIntent({ message, chatHistory = [] }) {
  const text = normalizeText(message)
  const previousUserText = normalizeText(getLastUserMessage(chatHistory))
  const shouldUsePreviousContext = isFollowUp(text) && previousUserText
  const combinedText = shouldUsePreviousContext ? `${previousUserText} ${text}` : text

  const scores = Object.entries(intentKeywords)
    .map(([intent, keywords]) => ({
      intent,
      score: getScore(combinedText, keywords),
    }))
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score)

  if (scores.length === 0) {
    return {
      confidence: text.length <= 12 ? 0.7 : 0.35,
      intent: 'general',
      isFollowUp: Boolean(shouldUsePreviousContext),
      matchedIntents: [],
    }
  }

  return {
    confidence: Math.min(0.95, 0.55 + scores[0].score * 0.15),
    intent: scores[0].intent,
    isFollowUp: Boolean(shouldUsePreviousContext),
    matchedIntents: scores.slice(0, 3).map((entry) => entry.intent),
  }
}
