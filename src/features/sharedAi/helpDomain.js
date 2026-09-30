import { buildAiHelpInstructions } from '../../../api/_shared/aiHelp/prompt.js'
import { routeHelpQuestion } from '../aiHelp/helpRouter.js'
import { searchKnowledge } from '../aiHelp/knowledgeSearch.js'
import { HELP_DOMAIN_ID, HELP_TOOL_ALLOWLIST, defineAiDomain } from './domainContract.js'

export const helpDomain = defineAiDomain({
  allowedTools: HELP_TOOL_ALLOWLIST,
  context: () => ({ data: null, ok: true, personal: false }),
  fallback: () => ({ status: 'unanswered' }),
  id: HELP_DOMAIN_ID,
  instructions: (input) => buildAiHelpInstructions(input),
  retrieve: (question, pinnedIds = []) => searchKnowledge(question, pinnedIds),
  route: (input) => routeHelpQuestion(input),
})
