-- Follow-up to migrations already applied in Staging; no remote application.
-- Read-only eligibility shared by reserve_quota. Keep historical migrations intact.
create or replace function billing.open_paid_plan_id(p_user_id uuid, p_assigned_plan_id text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_assigned_plan_id is null or p_assigned_plan_id = 'plan.free'
      then coalesce(p_assigned_plan_id, 'plan.free')
    when exists (
      select 1 from billing.user_plan_assignments a
      where a.user_id = p_user_id and a.plan_id = p_assigned_plan_id
        and a.source = 'admin-seed'
    ) then p_assigned_plan_id
    when exists (
      select 1 from billing.subscriptions s
      where s.user_id = p_user_id and s.plan_id = p_assigned_plan_id
        and s.current_period_start <= pg_catalog.now()
        and s.current_period_end > pg_catalog.now()
        and (
          s.status in ('TRIALING', 'ACTIVE')
          or (s.status = 'PAST_DUE' and s.past_due_grace_until > pg_catalog.now())
        )
    ) then p_assigned_plan_id
    else 'plan.free'
  end;
$$;

revoke all on function billing.open_paid_plan_id(uuid, text) from public, anon, authenticated, service_role;
grant execute on function billing.open_paid_plan_id(uuid, text) to service_role;
