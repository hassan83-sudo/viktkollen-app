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
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('user_backups', 'user_sync_state', 'user_sync_events')
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
  and tablename in ('user_backups', 'user_sync_state', 'user_sync_events')
order by tablename, policyname;

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('user_backups', 'user_sync_state', 'user_sync_events')
  and column_name in ('id', 'user_id', 'payload', 'data', 'checksum', 'created_at', 'updated_at')
order by table_name, ordinal_position;

select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('user_backups', 'user_sync_state', 'user_sync_events')
order by tablename, indexname;

-- Required manual interpretation:
-- 1. RLS must be enabled for all user-owned tables.
-- 2. SELECT/INSERT/UPDATE/DELETE policies must scope rows to auth.uid() = user_id
--    where the app uses that operation.
-- 3. user_sync_state should have a unique constraint/index for user_id.
-- 4. No policy should allow cross-user access through true, anon-wide, or service-role
--    assumptions in client flows.
