import { explainCoachRoute } from './coachRouter.js'
import { createViktkollenCoachContext } from './coachDataProvider.js'
import { requestCoachModelReply } from './coachModelClient.js'
import { coachDomain } from '../sharedAi/coachDomain.js'

const PANEL_HISTORY_LIMIT = 8
const PANEL_MESSAGE_CHARS = 600

function todayString(value) {
  if (!value) return new Date().toISOString().slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

export function narrowCoachPanelSource(appData = {}) {
  const profile = appData.profile && typeof appData.profile === 'object' ? appData.profile : {}
  const checkIn = appData.checkIn && typeof appData.checkIn === 'object' ? appData.checkIn : null
  return {
    bodyAnalysisHistory: appData.bodyAnalysisHistory,
    checkIn: checkIn ? { steps: checkIn.steps, workout: checkIn.workout } : null,
    foods: Array.isArray(appData.foods)
      ? appData.foods.map((item) => ({ done: item?.done, label: item?.label || item?.title }))
      : [],
    meals: appData.meals,
    nutritionGoals: appData.nutritionGoals,
    profile: {
      dietaryPreferences: profile.dietaryPreferences,
      goalWeight: profile.goalWeight,
      provenance: profile.provenance,
      weightDirection: profile.weightDirection,
    },
    today: todayString(appData.today),
    weights: appData.weights,
  }
}

function panelMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => {
      const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : ''
      const content = String(message?.content || message?.text || '').replace(/\s+/g, ' ').trim().slice(0, PANEL_MESSAGE_CHARS)
      return role && content ? { content, role } : null
    })
    .filter(Boolean)
    .slice(-PANEL_HISTORY_LIMIT)
}

function present(result) {
  if (result?.source === 'other-domain') {
    return {
      handoff: false,
      performed: false,
      reply: 'Den frågan hör till AI-Hjälpen. Jag för över inga personliga uppgifter och öppnar inget därifrån.',
      source: 'other-domain',
      tool: null,
    }
  }
  if (!result?.answer || result.source === 'knowledge-gap') {
    return {
      handoff: false,
      performed: false,
      reply: result?.answer || 'Jag har inte ett verifierat underlag för den frågan, så jag gissar inte.',
      source: result?.source || 'knowledge-gap',
      tool: null,
    }
  }
  return {
    handoff: false,
    performed: false,
    reply: result.answer,
    source: result.source === 'local-fallback' ? 'local' : result.source,
    tool: null,
  }
}

export async function answerCoachPanelQuestion({
  appData = {},
  messages = [],
  modelAnswer = null,
  onStatus = null,
} = {}) {
  const source = narrowCoachPanelSource(appData)
  const personal = coachDomain.context(createViktkollenCoachContext(source, { today: source.today }))
  const context = personal.ok ? personal.data : null
  const history = panelMessages(messages)
  const route = coachDomain.route({ context, languageCode: 'sv', messages: history })
  const local = explainCoachRoute(route, context)
  if (local && route.kind !== 'model') return present(local)

  const answerer = typeof modelAnswer === 'function' ? modelAnswer : requestCoachModelReply
  onStatus?.('AI-coachen formulerar ett svar.')
  try {
    const modeled = await answerer({ context, messages: history, route })
    if (modeled?.ok && modeled.answer) return present(modeled)
    if (modeled?.code === 'MODEL_LIMITED' && route.fallbackEntry) {
      return present(explainCoachRoute({ entry: route.fallbackEntry, kind: 'local' }, context))
    }
  } catch {
    return {
      handoff: false,
      performed: false,
      reply: 'AI-coachen kunde inte svara just nu.',
      source: 'provider-unavailable',
      tool: null,
    }
  }
  return {
    handoff: false,
    performed: false,
    reply: 'AI-coachen kunde inte svara just nu.',
    source: 'provider-unavailable',
    tool: null,
  }
}
