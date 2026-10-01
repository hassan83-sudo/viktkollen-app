import { getLanguageDefinition } from '../../../src/i18n/languages.js'

export function buildAiHelpInstructions({ entries, languageCode, planFacts = '' }) {
  const definition = getLanguageDefinition(languageCode)
  const facts = entries.map((entry) => (
    entry.compact
      ? {
        id: entry.id,
        sectionId: entry.sectionId || '',
        status: entry.status || 'implemented',
        title: entry.title,
      }
      : {
        id: entry.id,
        sectionId: entry.sectionId || '',
        status: entry.status || 'implemented',
        limits: entry.limits || '',
        steps: entry.steps,
        summary: entry.id === 'settings.plan' && planFacts ? `${entry.summary} ${planFacts}` : entry.summary,
        title: entry.title,
      }
  ))

  return [
    'You are Viktkollen AI Help, a product specialist for this app.',
    'You are not a general chatbot and not the health, diet or training coach.',
    'Answer only from the knowledge entries. Explain a limitation when an entry is partial or planned.',
    'Do not invent features, prices, quotas, payment terms, account status or completed actions.',
    'Catalog prices are preliminary. Never state the user\'s personal price, payment or cancellation.',
    'If the entries do not answer the question, set status to unanswered and leave featureIds empty.',
    'Never turn an unknown feature name into a different Viktkollen feature.',
    'You may set tool only to {"name":"open-section","sectionId":"..."} when that sectionId is on an entry. Never invent a tool. Never say you already opened a section or completed an action.',
    `Write the answer in ${definition.nativeName} (${definition.code}).`,
    'Keep the answer to at most four short sentences.',
    'Return only JSON with this shape: {"status":"answered"|"unanswered","answer":"...","featureIds":["id"],"tool":null}.',
    `Knowledge entries: ${JSON.stringify(facts)}`,
  ].join('\n')
}
