-- Private support queue. Only the existing authenticated server API may invoke these commands.
-- No account, subscription, payment or permission writes are performed by this schema.
begin;
create schema if not exists support;
revoke all on schema support from public, anon, authenticated;
grant usage on schema support to service_role;

create table support.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  category text not null check (category in ('billing','technical','account','other')),
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  status text not null default 'open' check (status in ('open','in_progress','answered','resolved')),
  thread jsonb not null check (jsonb_typeof(thread) = 'array' and jsonb_array_length(thread) between 1 and 50),
  notification_pending boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, request_id)
);
alter table support.tickets enable row level security;
revoke all on support.tickets from public, anon, authenticated;
grant select, insert, update on support.tickets to service_role;
create index support_queue on support.tickets (notification_pending, priority, created_at);
create index support_owner on support.tickets (user_id, created_at desc);

create function support.paid_eligible(p_user uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from billing.subscriptions s join billing.plans p on p.plan_id = s.plan_id
    where s.user_id = p_user and p.price_minor > 0
      and s.current_period_start <= now() and s.current_period_end > now()
      and (s.status = 'ACTIVE' or (s.status = 'PAST_DUE' and s.past_due_grace_until > now()))
  );
$$;

create function support.customer_command(p_actor uuid, p_action text, p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare eligible boolean; ticket support.tickets; msg text; request_key uuid;
begin
  if p_actor is null then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  eligible := support.paid_eligible(p_actor);
  if p_action = 'list' then
    return jsonb_build_object('ok',true,'eligible',eligible,'tickets', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id' - 'request_id' order by t.created_at desc)
      from (select * from support.tickets where user_id = p_actor order by created_at desc limit 50) t
    ),'[]'::jsonb));
  end if;
  if not eligible then return jsonb_build_object('ok',false,'code','PAID_SUPPORT_REQUIRED'); end if;
  msg := trim(coalesce(p_body->>'message',''));
  if length(msg) not between 1 and 2000 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  -- Serialize per customer: retries cannot duplicate tickets/alerts and parallel requests cannot bypass limits.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text, 0));
  if p_action = 'create' then
    request_key := (p_body->>'requestId')::uuid;
    if request_key is null or coalesce(p_body->>'category','') not in ('billing','technical','account','other') then
      return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
    end if;
    select * into ticket from support.tickets where user_id = p_actor and request_id = request_key;
    if found then return jsonb_build_object('ok',true,'ticket',to_jsonb(ticket) - 'user_id' - 'request_id'); end if;
    if (select count(*) from support.tickets where user_id = p_actor and status in ('open','in_progress')) >= 3
      or (select count(*) from support.tickets where user_id = p_actor and created_at > now() - interval '1 day') >= 10 then
      return jsonb_build_object('ok',false,'code','RATE_LIMITED');
    end if;
    insert into support.tickets(user_id,request_id,category,priority,thread)
      values(p_actor,request_key,p_body->>'category',case when p_body->>'category' = 'billing' then 'high' else 'normal' end,
        jsonb_build_array(jsonb_build_object('role','customer','message',msg,'at',now()))) returning * into ticket;
  elsif p_action = 'reply' then
    select * into ticket from support.tickets where id = (p_body->>'ticketId')::uuid and user_id = p_actor for update;
    if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
    if jsonb_array_length(ticket.thread) >= 50 then return jsonb_build_object('ok',false,'code','RATE_LIMITED'); end if;
    if ticket.updated_at > now() - interval '5 seconds' then return jsonb_build_object('ok',false,'code','RATE_LIMITED'); end if;
    if ticket.version <> (p_body->>'version')::integer or p_body->>'version' is null then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
    update support.tickets set thread = thread || jsonb_build_array(jsonb_build_object('role','customer','message',msg,'at',now())),
      status = 'open', notification_pending = true, version = version + 1, updated_at = now()
      where id = ticket.id returning * into ticket;
  else return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  return jsonb_build_object('ok',true,'ticket',to_jsonb(ticket) - 'user_id' - 'request_id');
end;
$$;

create function support.admin_command(p_actor uuid, p_action text, p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare ticket support.tickets; msg text;
begin
  if not coalesce(billing.has_billing_admin(p_actor),false) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if p_action = 'list' then
    return jsonb_build_object('ok',true,'pendingCount',(select count(*) from support.tickets where notification_pending),
      'tickets', coalesce((select jsonb_agg(to_jsonb(t) - 'request_id' order by
        case when t.status = 'resolved' then 1 else 0 end,
        case t.priority when 'high' then 0 when 'normal' then 1 else 2 end, t.created_at)
        from (select * from support.tickets order by case when status = 'resolved' then 1 else 0 end,
          case priority when 'high' then 0 when 'normal' then 1 else 2 end, created_at limit 200) t),'[]'::jsonb));
  end if;
  select * into ticket from support.tickets where id = (p_body->>'ticketId')::uuid for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if ticket.version <> (p_body->>'version')::integer or p_body->>'version' is null then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  if p_action = 'update' then
    if coalesce(p_body->>'status','') not in ('open','in_progress','answered','resolved')
      or coalesce(p_body->>'priority','') not in ('high','normal','low') then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
    update support.tickets set status = p_body->>'status', priority = p_body->>'priority', notification_pending = false,
      version = version + 1, updated_at = now() where id = ticket.id returning * into ticket;
  elsif p_action = 'reply' then
    msg := trim(coalesce(p_body->>'message',''));
    if length(msg) not between 1 and 2000 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
    if jsonb_array_length(ticket.thread) >= 50 then return jsonb_build_object('ok',false,'code','RATE_LIMITED'); end if;
    update support.tickets set thread = thread || jsonb_build_array(jsonb_build_object('role','support','message',msg,'at',now())),
      notification_pending = false, status = 'answered', version = version + 1, updated_at = now()
      where id = ticket.id returning * into ticket;
  else return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  return jsonb_build_object('ok',true,'ticket',to_jsonb(ticket) - 'request_id');
end;
$$;

revoke all on function support.paid_eligible(uuid) from public, anon, authenticated;
revoke all on function support.customer_command(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function support.admin_command(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function support.paid_eligible(uuid), support.customer_command(uuid,text,jsonb), support.admin_command(uuid,text,jsonb) to service_role;
commit;
