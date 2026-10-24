/**
 * Server-only RPC adapter for exclusive SumUp renewal claims.
 * A claim is not a payment instruction. No provider API is called here.
 */
export function createSumUpRenewalClaimPort({ client } = {}) {
  if (!client || typeof client.schema !== 'function') {
    throw new Error('SUMUP_DURABLE_RENEWAL_UNAVAILABLE')
  }
  return {
    async claim({ checkoutReference, subscriptionId, periodEnd } = {}) {
      if (!/^[A-Za-z0-9._:-]{1,64}$/.test(checkoutReference || '') ||
          typeof subscriptionId !== 'string' || !subscriptionId ||
          typeof periodEnd !== 'string' || !Number.isFinite(Date.parse(periodEnd))) {
        throw new Error('INVALID_RENEWAL_CLAIM')
      }
      const { data, error } = await client.schema('billing').rpc('claim_sumup_renewal_attempt', {
        p_checkout_reference: checkoutReference,
        p_subscription_id: subscriptionId,
        p_period_end: periodEnd,
      })
      if (error) throw new Error('SUMUP_RENEWAL_CLAIM_FAILED')
      if (!data || typeof data.claimed !== 'boolean' ||
          data.checkout_reference !== checkoutReference ||
          !['processing', 'succeeded', 'failed', 'reserved', 'created'].includes(data.status)) {
        throw new Error('SUMUP_RENEWAL_CLAIM_INVALID_RESPONSE')
      }
      return { claimed: data.claimed, status: data.status }
    },
  }
}
