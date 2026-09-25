# Account-deletion staging harness

TEST/STAGING ONLY.

NEVER RUN AGAINST PRODUCTION.

NEVER RUN AGAINST BILLING-STAGING.

REQUIRES A DEDICATED ISOLATED APP-STAGING PROJECT.

NO PRODUCTION DATA.

This harness validates account-deletion database atomicity and is not a complete reproduction of Production authorization/RLS.

## Environment guard

Every executable SQL file refuses to run unless the session already has:

`viktkollen.account_deletion_harness = isolated-app-staging`

Set that in the isolated test session before running any file. The SQL files do not set it themselves. A missing or different value fails closed. No project ref is hardcoded.

## Service role

Do not call `purge_account_user_data` as postgres in the SQL editor when `auth.role()` has no service_role JWT context. That call fails with `not allowed`.

`04_verification.sql` sets a transaction-local `request.jwt.claim.role` of `service_role` and then calls the function in that same transaction. That is the database atomicity runner. It stores no key.

The API-boundary method is a service-role HTTP RPC to `/rest/v1/rpc/purge_account_user_data` against only the isolated app-staging project. Do not put the service-role key in the repo or in SQL.

## Scenario model

Each failure scenario starts from the same committed baseline. Run `01_test_data.sql` again before a new full pass. Do not chain scenarios on leftover mutations.

1. Set the harness marker in the session.
2. `00_bootstrap.sql` once.
3. `01_test_data.sql` to reset synthetic fixtures, including the named Vault secret.
4. `04_verification.sql` for the database atomicity pass. It checks the baseline, runs guardian, Policy C, sync, F13, and F14 failures inside transactions that roll back, then runs success and a second call.

`02_failure_injection.sql` is only for a separate RPC scenario. Set `viktkollen.account_deletion_failure_point` to exactly one of `policy_c`, `sync`, `f13`, or `f14`. A missing or unknown value raises. The file drops the other test triggers and creates one. Then call the RPC. Then assert. Then `03_cleanup_failure_injection.sql`.

Do not leave a committed failure trigger in place before `04_verification.sql`. `04` drops leftover test triggers first.

## Fixture transactions

`01_test_data.sql` opens one transaction after the guard. It disables owner triggers only inside that transaction, inserts rows, enables the triggers, then commits. `DISABLE TRIGGER` is transactional. If a statement fails, run `ROLLBACK` in that same session before retrying. A successful commit leaves the triggers enabled.

## Vault

The fixture calls `vault.create_secret` with the name `f26-synthetic-account-deletion-backup-key` and stores the returned id in `private.user_backup_keys`. The F14 failure scenario proves that a later error restores both the key row and that named secret. Success expects both to be gone. Failure-injection cleanup removes only the test triggers and test functions. It does not delete that fixture secret.

## RLS

RLS is enabled, and forced where Production forces it. Policies that depend on `viktkollen_is_place_family_member` or `place_trip_shares` are omitted.

## Auth deletion

This package does not call `auth.admin.deleteUser`. After a successful purge, synthetic Auth user A must still exist.
