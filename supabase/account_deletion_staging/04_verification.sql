-- HARD WARNING: TEST/STAGING ONLY.
-- NEVER RUN AGAINST PRODUCTION.
-- NEVER RUN AGAINST BILLING-STAGING.
-- This file calls purge_account_user_data. Run it only in the isolated
-- app-staging project, as service_role, after 00 and 01.
-- It does not call auth.admin.deleteUser.

-- Baseline: user A rows exist, user C sync row exists, Auth user A exists.
-- select count(*) from auth.users where id = '11111111-1111-4111-8111-111111111111';

-- A. Guardian blocker. Unique user_id means A cannot also stay in the
-- transfer family. The move and the failed purge share one transaction.
-- begin;
-- delete from public.place_family_members
-- where user_id = '11111111-1111-4111-8111-111111111111';
-- insert into public.place_families (id, created_by)
-- values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111');
-- insert into public.place_family_members (family_id, user_id, role)
-- values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'guardian');
-- select public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
-- -- expect SQLSTATE P0001, message 'no remaining guardian'
-- rollback;
-- After rollback the transfer family and all other A rows are unchanged.

-- B/H. Transfer success, with 02 triggers absent.
-- select public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
-- Expect created_by of family 4444... is user B.
-- Expect A's membership, social rows, sync rows, backup, F13 rows, and F14 rows are gone.
-- Expect the voice call row, B's message, B's membership, and C's sync item to remain.
-- Expect auth.users still contains user A.

-- I. Second run.
-- select public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
-- Expect success with no restored rows.

-- Failure cases. Install one trigger from 02, call purge, expect
-- 'TEST ONLY failure injection', then rollback. Repeat separately for
-- Policy C, sync, F13, and F14. Run 03 after the set.
