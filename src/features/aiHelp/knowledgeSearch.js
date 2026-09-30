import { scoreLabeledEntry, tokenize } from '../sharedAi/questionText.js'
import { getKnowledgeEntry, isKnowledgeId, knowledgeCatalog } from './knowledgeCatalog.js'

export const KNOWLEDGE_CONTEXT_LIMIT = 6

export function rankKnowledge(question, pinnedIds = []) {
  const tokens = tokenize(question)
  const pinned = new Set((Array.isArray(pinnedIds) ? pinnedIds : []).filter(isKnowledgeId))
  return knowledgeCatalog
    .map((entry) => ({
      entry,
      score: scoreLabeledEntry(entry, tokens, question) + (pinned.has(entry.id) ? 2 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
}

export function searchKnowledge(question, pinnedIds = []) {
  const ranked = rankKnowledge(question, pinnedIds).map((item) => item.entry)
  const pinned = (Array.isArray(pinnedIds) ? pinnedIds : [])
    .filter(isKnowledgeId)
    .map(getKnowledgeEntry)
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

export function selectKnowledgeContext(question, pinnedIds = []) {
  return searchKnowledge(question, pinnedIds).slice(0, KNOWLEDGE_CONTEXT_LIMIT)
}

export function compactKnowledgeIndex() {
  return knowledgeCatalog.map((entry) => ({
    compact: true,
    id: entry.id,
    sectionId: entry.sectionId,
    status: entry.status,
    steps: [],
    summary: '',
    title: entry.title,
  }))
}
