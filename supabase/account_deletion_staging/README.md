# Account-deletion staging harness

TEST/STAGING ONLY.

NEVER RUN AGAINST PRODUCTION.

NEVER RUN AGAINST BILLING-STAGING.

REQUIRES A DEDICATED ISOLATED APP-STAGING PROJECT.

NO PRODUCTION DATA.

This harness validates account-deletion database atomicity and is not a complete reproduction of Production authorization/RLS.

## Install order

1. Create three synthetic Auth users in the isolated project only. Suggested emails: `f24-user-a@invalid.test`, `f24-user-b@invalid.test`, `f24-user-c@invalid.test`. Use the UUIDs in `01_test_data.sql`.
2. `00_bootstrap.sql`
3. `01_test_data.sql`
4. For a failure case, `02_failure_injection.sql`
5. `04_verification.sql` as a manual checklist. Do not point it at Production.
6. `03_cleanup_failure_injection.sql`

Purge function bodies in `00_bootstrap.sql` are exact copies of the account-deletion migrations. Do not edit them here.

## RLS

RLS is enabled, and forced where Production forces it, for the F22/F23 tables. Policies that depend on `public.viktkollen_is_place_family_member` or `public.place_trip_shares` are omitted. Those objects are not required for `SECURITY DEFINER` cleanup. Execute rights are still revoked from `public`, `anon`, and `authenticated` on the purge functions, and granted to `service_role`.

## Triggers

`viktkollen_place_touch_updated_at` runs on family and share updates, including the F15 ownership update. Owner triggers on sync, backups, and reminder schedules overwrite or require `auth.uid()`. Fixture SQL disables them only while inserting synthetic rows, then enables them. The reminder function is unchanged.

## Vault

`private.user_backup_keys` uses a synthetic `secret_id`. The existing delete trigger looks for `vault.secrets` and matches nothing. No Production secret is created.

## Auth deletion

This package does not call `auth.admin.deleteUser`. Auth deletion stays outside the database transaction.
