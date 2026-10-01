import { classifyDomainIntent } from '../sharedAi/domainIntent.js'
import { contextHasField } from './coachContext.js'
import { getCoachEntry } from './coachKnowledge.js'
import { COACH_CONTEXT_LIMIT, rankCoachKnowledge } from './coachSearch.js'

const examplePattern = /exempel|enklare|förklara|andra ord/i
const urgentPattern = /\b(bröstsmärta|kan inte andas|självmord|ta livet av mig|överdos|svimmade|stroke|ring 112|ändra (?:min )?dos|höj dosen|sluta med (?:min )?medicin)\b/i
const medicalPattern = /\b(diagnos|diagnostisera|cancer|tumör|diabetes|medicin|läkemedel|blodtryck|ätstörning|anorexi|bulimi|självskada|gravid|hjärtinfarkt|depression)\b/i
const needsStoredPattern = /\b(hur har min|har min|min vikttrend|mitt mål|min målvikt|vad åt jag|min aktivitet|mina måltider|mina vanor|åt rätt håll|min protein|mitt protein|vad vägde jag|senaste vikten|protein idag|tillräckligt med protein|hur ligger jag)\b/i
const modelPattern = /jämför|skillnad mellan/i

const SAFETY_TEXT = 'Jag är en vanecoach i Viktkollen och kan inte bedöma sjukdom, medicin eller diagnos. För det behöver du vården. Jag kan fortfarande prata om vanor, mat och viktloggning.'
const URGENT_TEXT = 'Det här låter akut. Jag är en vanecoach och kan inte bedöma sjukdom, medicin eller diagnos. Kontakta vården, eller ring 112 om du behöver akut hjälp.'

function isConfident(ranked) {
  const [top, second] = ranked
  if (!top) return false
  const lead = top.score - (second?.score || 0)
  if ((second?.score || 0) >= 6 && lead < 5) return false
  return top.score >= 3 && lead >= 3
}

function formatContextValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object') return ''
  const parts = []
  if (value.direction) parts.push(`riktning ${value.direction}`)
  if (value.changeKg != null) parts.push(`${value.changeKg} kg`)
  if (value.summary) parts.push(String(value.summary))
  if (value.grams != null) parts.push(`${value.grams} g`)
  if (value.label) parts.push(String(value.label))
  return parts.join(', ')
}

function describeWeight(trend) {
  if (!trend || typeof trend !== 'object') return ''
  if (trend.latestKg != null && trend.changeKg != null && trend.direction && trend.status !== 'single') {
    const scan = trend.bodyScanEstimate
      ? ` Kroppsskanningens estimat ${trend.bodyScanEstimate.minKg}–${trend.bodyScanEstimate.maxKg} kg är separat och ingår inte i den uppmätta vikten.`
      : ''
    return `Senaste registrerade vikten är ${trend.latestKg} kg. Förändringen mellan de två senaste verifierade värdena är ${trend.changeKg} kg, riktning ${trend.direction}.${scan}`
  }
  if (trend.status === 'single' && trend.latestKg != null) {
    return `Senaste registrerade vikten är ${trend.latestKg} kg. Det finns bara ett värde, så en trend kan inte beräknas.`
  }
  if (trend.changeKg != null && trend.direction) return `riktning ${trend.direction}, ${trend.changeKg} kg`
  return formatContextValue(trend)
}

function describeGoal(goal) {
  if (!goal || typeof goal !== 'object') return typeof goal === 'string' ? String(goal) : ''
  const parts = []
  if (goal.goalKg != null) parts.push(`Registrerat viktmål är ${goal.goalKg} kg`)
  if (goal.direction) parts.push(`målets riktning är ${goal.direction}`)
  if (goal.remainingKg != null) parts.push(`skillnaden mot senaste uppmätta vikten är ${goal.remainingKg} kg`)
  return parts.join('. ')
}

function describeField(field, value) {
  if (field === 'weightTrend') return describeWeight(value)
  if (field === 'goal') return describeGoal(value)
  if (field === 'protein' && value?.grams != null) {
    const target = value.targetGrams != null ? ` Registrerat proteinmål är ${value.targetGrams} g.` : ''
    return `Registrerat protein är ${value.grams} g från ${value.mealCount || 0} måltider.${target}`
  }
  if (field === 'meals' && value?.count != null) {
    const names = value.names?.length ? ` ${value.names.join(', ')}.` : ''
    return `Registrerade måltider idag: ${value.count}.${names}`
  }
  if (field === 'activity') {
    const steps = value?.steps != null ? `${value.steps} steg` : ''
    const workout = value?.workout ? value.workout : ''
    return [steps, workout].filter(Boolean).join(', ')
  }
  if (field === 'habits' && value?.total != null) return `${value.done || 0} av ${value.total} vanor är klara.`
  return formatContextValue(value)
}

export function localCoachAnswer(entry, { context = null, examples = false, personal = false } = {}) {
  const exampleText = examples && entry.examples?.length ? ` Exempel: ${entry.examples.join(' ')}` : ''
  const personalText = personal
    ? (entry.contextFields || [])
      .filter((field) => contextHasField(context, field))
      .map((field) => describeField(field, context[field]))
      .filter(Boolean)
      .join(' ')
    : ''
  const known = personalText ? ` Registrerad data: ${personalText}` : ''
  return `${entry.summary} ${entry.limits || ''}${exampleText}${known}`.replace(/\s+/g, ' ').trim()
}

export function routeCoachQuestion({
  context = null,
  languageCode = 'sv',
  messages = [],
  pinnedIds = [],
} = {}) {
  const latest = messages[messages.length - 1]?.content || ''
  const intent = classifyDomainIntent(latest)
  if (intent.domain === 'help') {
    return { domain: 'help', handoff: false, kind: 'other-domain', performed: false }
  }
  if (urgentPattern.test(latest)) return { kind: 'urgent' }
  if (medicalPattern.test(latest)) return { kind: 'safety' }

  const earlier = [...messages].reverse().find((message) => message !== messages[messages.length - 1] && message?.role === 'user')
  const follow = examplePattern.test(latest)
  const dinnerFollow = Boolean(earlier?.content) && /middag/i.test(latest) && !needsStoredPattern.test(latest)
  const baseText = (follow || dinnerFollow || modelPattern.test(latest)) && earlier?.content ? `${earlier.content} ${latest}` : latest
  const searchText = /vad åt jag|mina måltider/i.test(latest) ? `måltid ${baseText}` : baseText
  const ranked = rankCoachKnowledge(searchText, pinnedIds)
  const pinned = (Array.isArray(pinnedIds) ? pinnedIds : []).map(getCoachEntry).filter(Boolean)
  const top = ranked[0]?.entry || pinned[0] || null
  if (!top) return { kind: 'gap' }

  const needsStored = needsStoredPattern.test(latest)
  const asked = []
  if (/protein/i.test(latest)) asked.push('protein', 'meals')
  if (/vikt|vägde|trend|rätt håll/i.test(latest)) asked.push('weightTrend')
  if (/mål/i.test(latest)) asked.push('goal')
  if (/måltid|åt jag/i.test(latest)) asked.push('meals')
  if (/aktivitet|steg/i.test(latest)) asked.push('activity')
  if (/vana/i.test(latest)) asked.push('habits')
  const onEntry = (top.contextFields || []).filter((field) => asked.includes(field))
  const required = needsStored ? (onEntry.length ? onEntry : (top.contextFields || []).slice(0, 1)) : []
  const missing = required.filter((field) => !contextHasField(context, field))
  if (needsStored && missing.length) {
    return { entry: top, kind: 'context-gap', missing }
  }
  if (needsStored && top && !modelPattern.test(latest)) {
    return { entry: top, kind: 'local', personal: true }
  }

  if (follow) {
    if (!earlier?.content && !pinned.length) return { kind: 'gap' }
    return {
      entries: [top],
      entry: top,
      examples: /exempel/i.test(latest),
      fallbackEntry: top,
      kind: 'local',
    }
  }

  if (dinnerFollow) {
    const entry = /protein/i.test(earlier.content) ? getCoachEntry('coach.protein') : top
    return {
      entry,
      examples: true,
      fallbackEntry: entry,
      kind: 'local',
      personal: true,
    }
  }

  const synthesis = modelPattern.test(latest) || (/fokusera/i.test(latest) && context && Object.keys(context).length > 0)
  if (languageCode === 'sv' && isConfident(ranked) && !synthesis) {
    return { entry: top, kind: 'local' }
  }

  if ((ranked[0]?.score || 0) < 3 && !pinned.length) return { kind: 'gap' }
  return {
    entries: (ranked.length ? ranked : pinned.map((entry) => ({ entry }))).slice(0, COACH_CONTEXT_LIMIT).map((item) => item.entry),
    fallbackEntry: top,
    kind: 'model',
  }
}

export function explainCoachRoute(route, context = null) {
  if (route.kind === 'urgent' || route.kind === 'safety') {
    return {
      answer: route.kind === 'urgent' ? URGENT_TEXT : SAFETY_TEXT,
      knowledgeIds: [],
      source: 'safety',
      status: 'answered',
    }
  }
  if (route.kind === 'other-domain') {
    return {
      answer: '',
      handoff: false,
      knowledgeIds: [],
      performed: false,
      source: 'other-domain',
      status: 'unanswered',
    }
  }
  if (route.kind === 'gap') {
    return { answer: '', knowledgeIds: [], source: 'knowledge-gap', status: 'unanswered' }
  }
  if (route.kind === 'context-gap') {
    const scan = context?.weightTrend?.bodyScanEstimate
    const weightMissing = route.missing.includes('weightTrend')
    const answer = weightMissing
      ? `Registrerad uppmätt eller självloggad viktdata saknas. Jag gissar inte dina siffror.${scan ? ` Ett kroppsscanningsestimat (${scan.minKg}–${scan.maxKg} kg) finns separat och används inte som uppmätt vikt.` : ''}`
      : `${route.entry.summary} Personlig information saknas för: ${route.missing.join(', ')}. Jag gissar inte dina siffror.`
    return {
      answer,
      knowledgeIds: [route.entry.id],
      source: 'context-gap',
      status: 'unanswered',
    }
  }
  if (route.kind === 'local') {
    return {
      answer: localCoachAnswer(route.entry, { context, examples: route.examples, personal: route.personal }),
      knowledgeIds: [route.entry.id],
      source: 'local',
      status: 'answered',
    }
  }
  return null
}
