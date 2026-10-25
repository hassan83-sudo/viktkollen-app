# Preview auth preflight

Fail-closed guard for a Staging Preview. It blocks Production Supabase, a client/server project mismatch, a missing anon key or service role, and a service role exposed through `VITE_`.

Configuration only:

```bash
npm run auth:preview-preflight
```

Deployment, bundle, Auth, and billing-admin checks:

```bash
node scripts/run-preview-auth-preflight.js --deployment https://preview-deployment.example
```

The deployment command reads the process environment. It attempts a Staging login only after the configuration and built client both resolve to `armtslzspuebmlysnooq`. It never prints passwords, access tokens, refresh tokens, or service-role keys.

Optional account variables, both Staging-only:

- `PREVIEW_AUTH_TEST_EMAIL` and `PREVIEW_AUTH_TEST_PASSWORD`: least-privilege user. A successful protected call must return forbidden, not billing admin.
- `PREVIEW_AUTH_ADMIN_EMAIL` and `PREVIEW_AUTH_ADMIN_PASSWORD`: separate billing admin. The server check is `GET /api/billing/admin`, which only reads the existing admin capability.

Exit code 0 means the requested mode passed. Exit code 1 blocks the Preview. Missing account variables fail closed and do not create users or change permissions.

The GitHub Actions job runs the unit tests and the guard with fixture values. Its success does not certify a deployed Preview. Live deployment protection, the Staging test account, and the billing-admin account have to be supplied to the deployment command. Do not mark the workflow as a required check on `main`; that would block unrelated branches. This pull request stays draft until a real Preview run passes.
