# Extra scan purchases — development branch only

Status: **foundation only; not available for sale**. No production changes.

## Agreed behavior
- Monthly subscriptions remain the primary offering.
- Customers may choose to purchase **one or more** extra scans of a specific type: food, body, or AI eye.
- Plan changes remain scheduled for the next renewal.
- Purchased scans must not change the subscription plan.
- Final prices are undecided until the SumUp merchant setup and minimum charge/fees are confirmed.
- No customer-facing checkout or purchase button may be enabled before then.

## Newly agreed: subscription quota rollover
- Unused monthly subscription quotas also carry forward into subsequent months, without expiry while the account remains eligible.
- Keep carried-forward subscription quotas distinct from separately purchased extra quotas.
- On each renewal, add the new plan's monthly allotment to the existing unspent subscription balance; do not reset it.
- When changing plans at renewal, preserve existing accumulated subscription quotas and add the new plan's monthly allotment.
- The previous per-period limit/usage calculation in billing.reserve_quota is NOT compatible with this policy. Implement a durable per-feature grant ledger and transactional reservation/commit/rollback before activation.
- Define the exact treatment of free-plan transitions, account deletion, refunds, and abuse before shipping. Do not silently wipe accrued balances.

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
