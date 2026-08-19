-- Viktkollen Manual Release Acceptance V2/V1 enablement checks.
-- Safe by default: read-only checks only. Run as an authenticated project admin
-- in Supabase SQL Editor. Do not paste service-role keys into the client app.

select
  'user_backups table exists' as check_name,
  to_regclass('public.user_backups') is not null as pass;

select
  'user_sync_state table exists' as check_name,
  to_regclass('public.user_sync_state') is not null as pass;

select
  'user_sync_events table exists' as check_name,
  to_regclass('public.user_sync_events') is not null as pass;

select
  'user_sync_items table exists' as check_name,
  to_regclass('public.user_sync_items') is not null as pass;

select
  'user_entitlements table exists' as check_name,
  to_regclass('public.user_entitlements') is not null as pass;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('user_backups', 'user_sync_state', 'user_sync_events', 'user_sync_items', 'user_entitlements')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('user_backups', 'user_sync_state', 'user_sync_events', 'user_sync_items', 'user_entitlements')
order by tablename, policyname;

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('user_backups', 'user_sync_state', 'user_sync_events', 'user_sync_items', 'user_entitlements')
  and column_name in ('id', 'user_id', 'storage_key', 'payload', 'data', 'checksum', 'plan', 'status', 'provider', 'provider_customer_id', 'provider_subscription_id', 'current_period_end', 'created_at', 'updated_at', 'server_updated_at')
order by table_name, ordinal_position;

select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('user_backups', 'user_sync_state', 'user_sync_events', 'user_sync_items', 'user_entitlements')
order by tablename, indexname;

select
  'entitlement client write policy absent' as check_name,
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_entitlements'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and roles::text ilike '%authenticated%'
  ) as pass;

-- Required manual interpretation:
-- 1. RLS must be enabled for all user-owned tables.
-- 2. SELECT/INSERT/UPDATE/DELETE policies must scope rows to auth.uid() = user_id
--    where the app uses that operation.
-- 3. user_sync_state should have a unique constraint/index for user_id.
-- 3b. user_sync_items should have a unique constraint/index for (user_id, storage_key).
-- 3c. user_entitlements should have user_id as primary key and no authenticated
--     INSERT/UPDATE/DELETE policy.
-- 4. No policy should allow cross-user access through true, anon-wide, or service-role
--    assumptions in client flows.
