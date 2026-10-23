# Separate mobile installations (not released)

This branch prepares two additional installable PWAs without changing the default Viktkollen app.

| Installation | VITE_APP_VARIANT | Deployment | Supabase |
| --- | --- | --- | --- |
| Viktkollen | unset | existing Production | existing Production |
| Viktkollen Admin | admin | separate dedicated hostname/project | intended admin backend, server-side authorization required |
| Viktkollen Test | test | separate Preview hostname/project | Staging `armtslzspuebmlysnooq` only |

Each installation needs a **different origin** (hostname) to isolate Supabase sessions and browser storage. A different manifest id/icon alone does **not** isolate authentication or local storage on the same origin.

The Test build refuses to run if `VITE_SUPABASE_URL` is not the Staging project. On Vercel it also requires `VERCEL_ENV=preview`. Never share Production server keys with the Test deployment. Configure the Test project's server-only Supabase keys and API endpoints for Staging; review every backend function before enabling the deployment.

The Admin icon does **not** grant admin privileges. Existing server-side billing_admin/RLS checks remain mandatory. Do not use a publicly accessible admin build with secrets in client-side variables.

The two manifest/icon variants are selected during Vite build. Configure `VITE_APP_VARIANT` separately in each Vercel project, and configure unique stable hostnames. Never set the variant globally on the existing Production project.

Release gates:
1. Verify the existing Production deployment stays unchanged.
2. Run build and PWA-install tests for both variants.
3. Verify Test API calls and authentication only reach Staging, including server functions.
4. Verify Admin permissions with an authorized admin and denied ordinary account.
5. Confirm three distinct home-screen installations and independent login sessions on a physical phone.

No merge to main or deployment is authorized by this document.
