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
  if (checkout.status === 'PAID') return { verified: true, outcome: 'paid' }
  if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') {
    return { verified: true, outcome: 'failed' }
  }
  return { verified: true, outcome: 'pending' }
}
