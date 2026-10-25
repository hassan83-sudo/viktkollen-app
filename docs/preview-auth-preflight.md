# Preview auth preflight

## Current scope
The guard checks configuration, **not** whether a user's password works. It is fail-closed for Preview only. It rejects Production Supabase URLs, mismatched client/server projects, missing public anon key and accidentally exposed service-role variables.

Run on an authorized Preview runtime or an isolated runner with the **actual branch-scoped Preview configuration**:

```bash
node scripts/run-preview-auth-preflight.js
```

Exit code 0 = configuration passes; 1 = block. The command prints no credential values.

The GitHub Actions job uses **fixture values** to test the guard itself. Its success does not certify any deployed Preview or admin login. Never export live secrets into GitHub Actions just for this check.

## Required follow-up before full automation
1. Connect the guard to the Preview build or deployment gate with branch-scoped runtime values; do not run it on Production.
2. Verify deployed Preview's client bundle uses the intended Staging project (Vite client variables are embedded at build time).
3. Use a dedicated least-privileged Staging-only test user for an opt-in sign-in smoke test; no production credentials, no session/token logging, no password changes.
4. Verify billing_admin via an existing authenticated server-side read-only capability, not a client-side role flag.
5. Enforce required CI checks before merge; do not claim a GitHub workflow is mandatory until branch protection is configured.
6. Investigate the specific failing Preview login separately. Wrong credentials, account existence and Staging auth configuration are not determined by this guard.

Do not merge this branch into main or enable renewal/payment features without review.
