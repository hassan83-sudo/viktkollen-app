import { projectCoachContext, selectCoachModelContext } from '../../../src/features/aiCoach/coachContext.js'

const forbiddenKey = /email|phone|address|payment|subscription|gps|latitude|longitude|^lat$|^lng$|photo|displayName|height|card|token|password|user_?id/i

function stripValue(value, depth) {
  if (depth > 4) return undefined
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => stripValue(item, depth + 1)).filter((item) => item !== undefined)
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /@|sk-|Bearer\s/i.test(value)) return undefined
    return value
  }
  const clean = {}
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key)) continue
    const next = stripValue(child, depth + 1)
    if (next !== undefined) clean[key] = next
  }
  return clean
}

export function filterCoachRequestContext(raw, question) {
  return selectCoachModelContext(question, projectCoachContext(stripValue(raw, 0)))
}
