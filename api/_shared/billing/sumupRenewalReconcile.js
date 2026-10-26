/**
 * Verify a SumUp checkout against the original claimed renewal before
 * changing subscription state. This function never charges a card.
 */
export function verifySumUpRenewalCheckout({
  checkout,
  checkoutReference,
  customerId,
  merchantCode,
  amountMinor,
} = {}) {
  if (!checkout || !checkoutReference || !customerId || !merchantCode ||
      !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { verified: false, outcome: 'invalid' }
  }
  const amount = Number(checkout.amount)
  if (checkout.checkout_reference !== checkoutReference ||
      checkout.customer_id !== customerId ||
      checkout.merchant_code !== merchantCode ||
      checkout.currency !== 'SEK' ||
      !Number.isFinite(amount) ||
      Math.round(amount * 100) !== amountMinor ||
      Math.abs(amount * 100 - amountMinor) > 0.000001) {
    return { verified: false, outcome: 'mismatch' }
  }
  if (checkout.status === 'PAID') {
    const successful = (Array.isArray(checkout.transactions) ? checkout.transactions : [])
      .filter((tx) => tx?.status === 'SUCCESSFUL')
    if (successful.length !== 1 ||
        successful[0].currency !== 'SEK' ||
        !Number.isFinite(Number(successful[0].amount)) ||
        Math.abs(Number(successful[0].amount) * 100 - amountMinor) > 0.000001 ||
        typeof successful[0].id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(successful[0].id)) {
      return { verified: false, outcome: 'unverified_transaction' }
    }
    return { verified: true, outcome: 'paid' }
  }
  if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') {
    return { verified: true, outcome: 'failed' }
  }
  return { verified: true, outcome: 'pending' }
}
