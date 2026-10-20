# Preview login and daily coach review

Reviewed `fix/daily-coach-duplicate-requests-20261020` at `d7aa9ec`, locally
on `codex/preview-login-coach-review`. No remote push/deployment was performed.

## Blocking Preview configuration

Read-only Vercel inspection confirms the latest branch Preview
`dpl_A3P2Zev7oYDhV7WL958JgP6fiMRF` is READY for the reviewed commit.
Its branch-specific client URL references Staging `armtslzspuebmlysnooq`.
However, decoding only the role/project claims of the configured
`VITE_SUPABASE_ANON_KEY` shows `service_role` for that same Staging project.
No credential value was printed, copied to a file or committed. A server key
must never be supplied through a public VITE variable. Treat it as potentially
exposed; this inspection has not established the contents of the built bundle.

The server `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are inherited from
shared Preview configuration. Their decrypted values were not returned by the
available access, so complete server isolation has NOT been verified. Do not
infer server isolation from the client URL.

No live login or writing Preview test was attempted after this finding.
Required separately approved actions: replace the branch-specific public key
with the verified Staging anon/publishable key; revoke/rotate the potentially
exposed Staging server credential using the appropriate Supabase key process;
update affected server consumers safely; verify all effective server values
belong to Staging; and rebuild this branch Preview after approval. Do not alter
shared Preview or Production configuration as a shortcut.

## Staging test account

Read-only Auth metadata confirms `testkund-viktkollen@example.com` has the
expected UID `a51efb80-8a0b-44fc-ae4a-f7fe52221b6d`, confirmed email, a password
set, and no current ban. Last successful sign-in was 2026-10-20 06:42:13 UTC.
The inspected Staging Auth log window contains two password-login HTTP 200s,
two HTTP 400 `invalid_credentials` responses and successful refreshes. Those
aggregate failures were NOT safely attributable to this specific account.
No known password was available, none was guessed, and no password was changed.
After configuration isolation is repaired, the owner must supply a valid
password through secure local input or separately approve an Auth Admin reset.

## Daily coach correction

The original branch marks each user/day before awaiting its automatic request,
so ordinary rerenders no longer repeatedly request the same daily advice. Two
remaining issues were identified: the failure path still used the old full
snapshot key, and late replies/account or date changes could discard a day's
result or show a previous account's result.

The lifecycle is now isolated in a small hook, preserving one automatic attempt
per selected day and mounted account generation, including React StrictMode.
It caches each day's result, retains a settled local fallback on errors/429,
rejects late replies from a previous account generation, and hides results
belonging to another user. It does not persist advice or create a new backend.
The shared transport accepts an optional originating user/current-request guard
so a deferred auth read cannot send the previous user's payload under the new
user's session. Other callers keep their existing behavior. Reloading the app
starts a new mounted lifecycle; this is not a cross-tab or persistent daily cap.

A build/dev guard rejects server keys in `VITE_SUPABASE_ANON_KEY` and JWT
URL/project mismatches, using fixed messages without credential values. This
prevents future builds with the confirmed bad client configuration; it does
not revoke a credential already exposed or repair the existing deployment.

## Verification

11 focused hook/transport/public-key-guard tests pass. Coverage includes
StrictMode replay, unrelated rerenders, unchanged day, 429 fallback without
retry, date changes/out-of-order replies, account A → B → A, anonymous and
onboarding states, unmount, auth resolving under a different account and
rejected public server credentials. Targeted ESLint and diff checks pass.

An additional existing Vite test fails because it expects a restricted
`.trycloudflare.com` host list while the reviewed upstream branch already has
`allowedHosts: true`. That setting was not changed here. The other three cases
in that file pass. No claim that all repository tests are green is made.

All new runtime tests are local with mocked calls; a live authenticated Preview
end-to-end check is blocked by the configuration findings. No database, key,
environment, account, main, Production, payment or deployment was changed.
