# Extra scan purchases — development branch only

Status: **foundation only; not available for sale**. No production changes.

## Agreed behavior
- Monthly subscriptions remain the primary offering.
- Customers may choose to purchase **one or more** extra scans of a specific type: food, body, or AI eye.
- Plan changes remain scheduled for the next renewal.
- Purchased scans must not change the subscription plan.
- Final prices are undecided until the SumUp merchant setup and minimum charge/fees are confirmed.
- No customer-facing checkout or purchase button may be enabled before then.

## Quota rollover policy (current decision)
- Subscription monthly quotas do NOT carry over. Unused monthly allowances expire at renewal.
- Purchased extra scan quotas also do NOT carry forward indefinitely; unused extra quotas expire. The precise expiry boundary (subscription renewal or a fixed period after purchase) is not yet decided and must be displayed before purchase.
- Consume monthly subscription allowances before purchased extra quotas, while each balance is valid.
- Plan changes take effect at next renewal; monthly allowances follow the new plan.
- Do not implement subscription rollover without a new explicit decision and profitability review.
- Keep existing per-period subscription quota accounting unchanged.

## Required before activation
1. Approve server-controlled SEK prices including VAT; check SumUp minimum charge.
2. Implement a durable purchase-intent record bound to authenticated user, product, quantity and exact server-side price.
3. Integrate SumUp checkout and verify paid status, amount, currency, merchant and ownership **on the server**.
4. Implement a database-atomic, idempotent grant keyed by unique provider payment/checkout ID; webhook retries must not double-credit.
5. Integrate purchased balances into the existing server-side quota reservation/commit/rollback SQL functions, consuming plan quota first and purchased units only when necessary. Never grant credits from client input.
6. Make read-only quota display show subscription and purchased balances separately.
7. Implement and clearly display purchased-quota expiry once the exact period is decided; define refund/chargeback reversal, failed scans and concurrency rules; test against double spending.
8. Verify end-to-end in sandbox before any production enablement.

This branch intentionally does **not** modify SumUp checkout, production billing tables, or quota RPCs. The feature remains disabled.
