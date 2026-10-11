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
- Unused subscription quotas carry forward to the next month and are added to that month's new allowance.
- Purchased extra quotas also carry forward, in a separate balance.
- Consume accumulated subscription quotas before purchased extra quotas.
- Plan changes take effect on renewal; preserve already accrued subscription quotas when changing plan.
- Existing per-period billing.reserve_quota calculations do not implement subscription rollover. Do not enable or deploy rollover until a durable grant ledger and atomic reserve/commit/rollback integration are complete and tested.
- Customer usage of carried-forward quotas still incurs future AI costs, even when the subscription was paid earlier.
- Account closure, refunds, and transitions to free plan require explicit policy before launch.

## Required before activation
1. Approve server-controlled SEK prices including VAT; check SumUp minimum charge.
2. Implement a durable purchase-intent record bound to authenticated user, product, quantity and exact server-side price.
3. Integrate SumUp checkout and verify paid status, amount, currency, merchant and ownership **on the server**.
4. Implement a database-atomic, idempotent grant keyed by unique provider payment/checkout ID; webhook retries must not double-credit.
5. Integrate purchased balances into the existing server-side quota reservation/commit/rollback SQL functions, consuming plan quota first and purchased units only when necessary. Never grant credits from client input.
6. Make read-only quota display show subscription and purchased balances separately.
7. Define refund/chargeback reversal, expiry policy, failed scans and concurrency rules; test against double spending.
8. Verify end-to-end in sandbox before any production enablement.

This branch intentionally does **not** modify SumUp checkout, production billing tables, or quota RPCs. The feature remains disabled.
