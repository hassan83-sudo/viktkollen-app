const EVENT_RE = /^[A-Za-z0-9._:-]+$/

function rejectClientRenewalClaim(clientClaim = {}) {
  void clientClaim.entitlement
  void clientClaim.payment_success
  void clientClaim.period_end
  void clientClaim.plan_id
  void clientClaim.price
  void clientClaim.provider
  void clientClaim.quota
}

function requireEventId(externalEventId) {
  const eventId = String(externalEventId || '').trim()
  if (!EVENT_RE.test(eventId) || eventId.length > 120) {
    const error = new Error('invalid_event_id')
    error.code = 'invalid_event_id'
    throw error
  }
  return eventId
}

export function createRenewalLifecycle({ now = () => new Date(), store, subscriptions }) {
  return {
    async applyTrustedRenewal({
      clientClaim = {},
      current_period_end = null,
      external_event_id,
      outcome,
      past_due_grace_until = null,
      subscription_id,
    }) {
      rejectClientRenewalClaim(clientClaim)
      const eventId = requireEventId(external_event_id)
      if (outcome !== 'succeeded' && outcome !== 'failed') {
        const error = new Error('invalid_renewal_outcome')
        error.code = 'invalid_renewal_outcome'
        throw error
      }
      const prior = (await store.listEvents()).find((event) => event.external_event_id === eventId)
      if (outcome === 'succeeded') {
        if (prior && (prior.operation !== 'period.advance' || prior.new_period_end !== current_period_end)) {
          const error = new Error('duplicate_external_event')
          error.code = 'duplicate_external_event'
          throw error
        }
        if (prior) return store.get(prior.subscription_id)
        if (await store.getByExternalEventId(eventId)) {
          const error = new Error('duplicate_external_event')
          error.code = 'duplicate_external_event'
          throw error
        }
        return subscriptions.advancePeriod({
          clientClaim: {},
          current_period_end,
          external_event_id: eventId,
          subscription_id,
        })
      }
      if (prior && prior.operation !== 'renewal.failed') {
        const error = new Error('duplicate_external_event')
        error.code = 'duplicate_external_event'
        throw error
      }
      return store.markPastDue({
        createdAt: now().toISOString(),
        externalEventId: eventId,
        graceUntil: past_due_grace_until,
        subscriptionId: subscription_id,
      })
    },
  }
}
