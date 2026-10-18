-- Server-side support alert claims; only service_role may read or write.
begin;
create table if not exists support.alert_deliveries (
  ticket_id uuid not null references support.tickets(id) on delete cascade,
  ticket_version integer not null check (ticket_version > 0),
  state text not null check (state in ('sending','sent','failed')),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (ticket_id, ticket_version)
);
alter table support.alert_deliveries enable row level security;
revoke all on support.alert_deliveries from public, anon, authenticated;
grant select, insert, update on support.alert_deliveries to service_role;

-- Atomic claims avoid two overlapping cron workers sending the same alert.
-- A failed or stale claim may be retried after five minutes.
create or replace function support.claim_pending_alerts(p_limit integer default 20)
returns table(ticket_id uuid, ticket_version integer)
language sql security invoker set search_path = '' as $$
  with pending as (
    select t.id, t.version
    from support.tickets t
    where t.notification_pending and t.status in ('open','in_progress')
    order by case t.priority when 'high' then 0 else 1 end, t.created_at
    limit least(greatest(p_limit,1),50)
  ), claims as (
    insert into support.alert_deliveries(ticket_id,ticket_version,state)
    select id,version,'sending' from pending
    on conflict (ticket_id,ticket_version) do update
      set state = 'sending', claimed_at = now()
      where support.alert_deliveries.state = 'failed'
         or (support.alert_deliveries.state = 'sending'
             and support.alert_deliveries.claimed_at < now() - interval '5 minutes')
    returning support.alert_deliveries.ticket_id, support.alert_deliveries.ticket_version
  )
  select claims.ticket_id, claims.ticket_version from claims;
$$;
revoke all on function support.claim_pending_alerts(integer) from public, anon, authenticated;
grant execute on function support.claim_pending_alerts(integer) to service_role;
commit;
