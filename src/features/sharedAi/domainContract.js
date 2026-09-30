export const HELP_DOMAIN_ID = 'help'
export const COACH_DOMAIN_ID = 'coach'
export const HELP_TOOL_ALLOWLIST = Object.freeze(['open-section'])
export const COACH_TOOL_ALLOWLIST = Object.freeze([])
export const FUTURE_COACH_CONTEXT_FIELDS = Object.freeze([
  'activity',
  'goal',
  'habits',
  'meals',
  'preferences',
  'protein',
  'weightTrend',
])

export function defineAiDomain({
  allowedTools = [],
  context = null,
  fallback = null,
  id,
  instructions,
  retrieve,
  route,
} = {}) {
  if (id !== HELP_DOMAIN_ID && id !== COACH_DOMAIN_ID) {
    throw new Error('invalid_domain')
  }
  if (typeof retrieve !== 'function' || typeof instructions !== 'function' || typeof route !== 'function') {
    throw new Error('invalid_domain')
  }
  const tools = Object.freeze([...new Set(allowedTools.map((name) => String(name || '')).filter(Boolean))])
  return {
    allowedTools: tools,
    context: typeof context === 'function' ? context : () => ({ data: null, ok: true, personal: false }),
    costGuard: 'shared',
    fallback: typeof fallback === 'function' ? fallback : () => ({ status: 'unanswered' }),
    id,
    instructions,
    retrieve,
    route,
    toolAllowed(name) {
      return tools.includes(String(name || ''))
    },
  }
}

export function readPersonalContext(domain, provider) {
  if (!domain || domain.id !== COACH_DOMAIN_ID) {
    return { data: null, ok: true, personal: false }
  }
  if (typeof provider !== 'function') {
    return { data: null, ok: false, personal: false, reason: 'context_provider_required' }
  }
  return { data: provider(), ok: true, personal: true, reason: 'explicit_provider' }
}
