import { SUBSCRIPTION_STATUS, SUBSCRIPTION_TERMINAL } from './catalog.js'

const ALLOWED = Object.freeze({
  [SUBSCRIPTION_STATUS.TRIALING]: Object.freeze([
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.CANCELED,
    SUBSCRIPTION_STATUS.EXPIRED,
    SUBSCRIPTION_STATUS.PAUSED,
  ]),
  [SUBSCRIPTION_STATUS.ACTIVE]: Object.freeze([
    SUBSCRIPTION_STATUS.CANCELED,
    SUBSCRIPTION_STATUS.EXPIRED,
    SUBSCRIPTION_STATUS.PAST_DUE,
    SUBSCRIPTION_STATUS.PAUSED,
  ]),
  [SUBSCRIPTION_STATUS.PAST_DUE]: Object.freeze([
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.CANCELED,
    SUBSCRIPTION_STATUS.EXPIRED,
  ]),
  [SUBSCRIPTION_STATUS.PAUSED]: Object.freeze([
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.CANCELED,
  ]),
  [SUBSCRIPTION_STATUS.CANCELED]: Object.freeze([]),
  [SUBSCRIPTION_STATUS.EXPIRED]: Object.freeze([]),
})

export function isTerminalSubscriptionStatus(status) {
  return SUBSCRIPTION_TERMINAL.includes(status)
}

export function assertSubscriptionTransition(from, to) {
  if (from === to) return
  const allowed = ALLOWED[from] || []
  if (!allowed.includes(to)) {
    const error = new Error('illegal_subscription_transition')
    error.code = 'illegal_subscription_transition'
    error.from = from
    error.to = to
    throw error
  }
}

export function allowedSubscriptionTransitions(from) {
  return ALLOWED[from] || []
}
