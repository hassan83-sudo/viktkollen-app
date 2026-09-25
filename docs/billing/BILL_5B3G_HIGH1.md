# BILL-5B3G — HIGH #1 PostgREST billing exposure

HIGH #1: VERIFIED / PASS

Production path that passed:

Production Vercel → `POST /api/billing/postgrest-probe` → PostgREST → `billing.feature_controls`

Evidence from the signed-in `billing_admin` session on Mer → Inställningar → Planer:

- The temporary control showed exactly `PostgREST billing: OK`.
- No quota/CAS, payment, or provider/OpenAI operation was run.

The temporary probe UI and `POST /api/billing/postgrest-probe` were removed after this verification. `billing_admin` bootstrap is unchanged. HIGH #3 is not part of this result.
