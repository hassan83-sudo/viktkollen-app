import { classifyDomainIntent } from '../sharedAi/domainIntent.js'
import { scoreLabeledEntry, tokenize } from '../sharedAi/questionText.js'
import { coachKnowledge, getCoachEntry, isCoachKnowledgeId } from './coachKnowledge.js'

export const COACH_CONTEXT_LIMIT = 4

export function rankCoachKnowledge(question, pinnedIds = []) {
  if (classifyDomainIntent(question).domain === 'help') return []
  const tokens = tokenize(question)
  const pinned = new Set((Array.isArray(pinnedIds) ? pinnedIds : []).filter(isCoachKnowledgeId))
  return coachKnowledge
    .map((entry) => ({
      entry,
      score: scoreLabeledEntry(entry, tokens, question) + (pinned.has(entry.id) ? 2 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
}

export function searchCoachKnowledge(question, pinnedIds = []) {
  const ranked = rankCoachKnowledge(question, pinnedIds).map((item) => item.entry)
  const pinned = (Array.isArray(pinnedIds) ? pinnedIds : [])
    .filter(isCoachKnowledgeId)
    .map(getCoachEntry)
    .filter(Boolean)
  const seen = new Set()
  const selected = []
  for (const entry of [...pinned, ...ranked]) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    selected.push(entry)
  }
  return selected
}
