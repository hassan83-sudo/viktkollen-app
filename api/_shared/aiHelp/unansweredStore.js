import { hashAiHelpScope } from './costGuard.js'

const records = []
const MAX_RECORDS = 100

function sanitizeQuestion(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\w.+-]+@[\w.-]+/g, '[email]')
    .replace(/\b\d{6,}\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

export function recordUnansweredQuestion({ language, question, userId } = {}) {
  const entry = {
    id: `gap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    language: String(language || ''),
    question: sanitizeQuestion(question),
    scope: hashAiHelpScope(userId),
  }
  records.push(entry)
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS)
  return { id: entry.id }
}

export function listUnansweredQuestionsForTests() {
  return records.map((entry) => ({ ...entry }))
}

export function clearUnansweredQuestionsForTests() {
  records.length = 0
}
