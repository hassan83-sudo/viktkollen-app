import { getKnowledgeEntry } from './knowledgeCatalog.js'
import { compactKnowledgeIndex, KNOWLEDGE_CONTEXT_LIMIT, rankKnowledge } from './knowledgeSearch.js'
import { toolForSection } from './aiHelpTools.js'

const rephrasePattern = /förklara|enklare|annat sätt|andra ord|mer detalj|utveckla|skillnad/i
const offTopicPattern = /dikt|poem|skämt|joke|huvudstad|capital of|läxa|python|javascript|översätt|translate this|väderprognos|aktie|koka |recept på|write a /i
const appIntentPattern = /öppna|öppnar|var finns|inställning|meny|flik|viktkollen|abonnemang|konto|påminn|kamera|mikrofon|notis/i
const openReferencePattern = /^(?:kan du |vill du |snälla )?(?:öppna|visa|gå till|ta mig till) (?:den|det|den där|dit)\??$/i

function isConfident(ranked) {
  const [top, second] = ranked
  if (!top) return false
  const lead = top.score - (second?.score || 0)
  if ((second?.score || 0) >= 6 && lead < 5) return false
  return (top.score >= 8 && lead >= 3) || (top.score >= 6 && lead >= 3)
}

export function localAnswerFor(entry, extra = '') {
  const status = entry.status === 'partial'
    ? ' Funktionen är bara delvis ansluten.'
    : entry.status === 'planned'
      ? ' Funktionen är planerad och finns inte att använda ännu.'
      : ''
  const steps = entry.steps?.length ? ` ${entry.steps.join(' ')}` : ''
  const limits = entry.limits ? ` ${entry.limits}` : ''
  return `${entry.summary}${status}${limits}${steps}${extra ? ` ${extra}` : ''}`.replace(/\s+/g, ' ').trim()
}

export function routeHelpQuestion({ languageCode = 'sv', messages = [], pinnedIds = [] } = {}) {
  const latest = messages[messages.length - 1]?.content || ''
  if (offTopicPattern.test(latest)) return { kind: 'out-of-scope' }
  const pinned = pinnedIds.map((id) => getKnowledgeEntry(id)).filter(Boolean)
  if (openReferencePattern.test(latest.trim())) {
    const target = pinned.length === 1 ? pinned[0] : null
    if (target && toolForSection(target.sectionId, target.title)) return { entry: target, kind: 'local' }
    return { kind: 'gap' }
  }
  const ranked = rankKnowledge(latest, pinnedIds)
  const top = ranked[0]?.entry || null
  const rephrase = rephrasePattern.test(latest)
  const confident = isConfident(ranked)
  const strong = ranked.filter((item) => item.score >= 3)

  if (rephrase && (strong.length || pinned.length)) {
    const entries = (strong.length ? strong : pinned.map((entry) => ({ entry, score: 3 })))
      .slice(0, KNOWLEDGE_CONTEXT_LIMIT)
      .map((item) => item.entry || item)
    return {
      entries,
      fallbackEntry: strong[0]?.entry || pinned[0],
      kind: 'model',
    }
  }

  if (languageCode === 'sv' && confident && top) {
    return { entry: top, kind: 'local' }
  }

  if (pinned.length && !strong.length) {
    return { entries: pinned, fallbackEntry: pinned[0], kind: 'model' }
  }

  if (strong.length) {
    return {
      entries: strong.slice(0, KNOWLEDGE_CONTEXT_LIMIT).map((item) => item.entry),
      fallbackEntry: confident ? top : null,
      kind: 'model',
    }
  }

  if (languageCode !== 'sv') {
    return {
      entries: compactKnowledgeIndex(),
      fallbackEntry: null,
      kind: 'model',
    }
  }

  if (!appIntentPattern.test(latest)) {
    return { kind: 'out-of-scope' }
  }

  return { kind: 'gap' }
}

export function localHelpResult(entry, { extra = '', source = 'local' } = {}) {
  return {
    answer: localAnswerFor(entry, extra),
    featureIds: [entry.id],
    ok: true,
    source,
    status: 'answered',
    tool: toolForSection(entry.sectionId, entry.title),
  }
}
