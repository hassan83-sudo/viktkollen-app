import { projectCoachContext } from '../aiCoach/coachContext.js'
import { buildCoachInstructions } from '../aiCoach/coachPrompt.js'
import { routeCoachQuestion } from '../aiCoach/coachRouter.js'
import { searchCoachKnowledge } from '../aiCoach/coachSearch.js'
import { COACH_DOMAIN_ID, COACH_TOOL_ALLOWLIST, defineAiDomain, readPersonalContext } from './domainContract.js'

export const coachDomain = defineAiDomain({
  allowedTools: COACH_TOOL_ALLOWLIST,
  context: (provider) => {
    const gate = readPersonalContext({ id: COACH_DOMAIN_ID }, provider)
    if (!gate.ok) return gate
    return { ...gate, data: projectCoachContext(gate.data) }
  },
  fallback: () => ({ reason: 'coach_not_connected', status: 'unanswered' }),
  id: COACH_DOMAIN_ID,
  instructions: (input) => buildCoachInstructions(input),
  retrieve: (question, pinnedIds = []) => searchCoachKnowledge(question, pinnedIds),
  route: (input) => routeCoachQuestion(input),
})
