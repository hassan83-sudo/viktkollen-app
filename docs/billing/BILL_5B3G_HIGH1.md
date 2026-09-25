# BILL-5B3G — HIGH #1 PostgREST billing exposure

HIGH #1: VERIFIED / PASS

Production path that passed:

Production Vercel → `POST /api/billing/postgrest-probe` → PostgREST → `billing.feature_controls`

Evidence from the signed-in `billing_admin` session on Mer → Inställningar → Planer:

- The temporary control showed exactly `PostgREST billing: OK`.
- No quota/CAS, payment, or provider/OpenAI operation was run.

The temporary probe UI and `POST /api/billing/postgrest-probe` were removed after this verification. `billing_admin` bootstrap is unchanged.

The same already completed probe is the HIGH #3 evidence (see BILL-5B3I). `PostgREST billing: OK` required `createSupabaseAdminClient()` to succeed. A missing service-role client would have returned `SERVICE_ROLE_UNAVAILABLE`. The secret value was not read in that test and is not recorded here. No second probe was run for HIGH #3.
