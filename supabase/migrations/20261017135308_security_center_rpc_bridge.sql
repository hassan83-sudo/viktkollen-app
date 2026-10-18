-- Security Center: service-role-only RPC bridge for Supabase PostgREST.
-- Private security_center schema remains unexposed to the Data API.
create or replace function public.security_center_recent_events(p_limit integer default 50)
returns table (id bigint, type text, severity text, feature text, occurred_at timestamptz)
language sql security invoker set search_path = ''
as $body$
  select * from security_center.recent_events(p_limit);
$body$;
revoke all on function public.security_center_recent_events(integer) from public, anon, authenticated;
grant execute on function public.security_center_recent_events(integer) to service_role;

create or replace function public.security_center_record_event(p_type text, p_severity text, p_feature text)
returns bigint
language sql security invoker set search_path = ''
as $body$
  select security_center.record_event(p_type,p_severity,p_feature);
$body$;
revoke all on function public.security_center_record_event(text,text,text) from public, anon, authenticated;
grant execute on function public.security_center_record_event(text,text,text) to service_role;
