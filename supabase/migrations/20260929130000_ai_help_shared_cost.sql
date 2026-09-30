-- AI Help shared cost ledger.
-- Local review copy only. Do not apply to staging or production
-- until this file has been reviewed and explicitly approved.
--
-- Time: clock_timestamp() is the only clock. Callers cannot pass a timestamp.
-- A reservation stays on the budget period that was open when it was created.
-- Ending that period does not release it and does not move its cost.
-- A later settlement updates that same period, including after the period has ended.
--
-- Lifecycle:
--   reserved   hold counts against its period; a model call may still cost money
--   uncertain  the outcome is unknown; the hold remains; new calls stay fail-closed
--   settled    actual token cost is booked on the original period
--   released   an operator confirmed the provider did not charge; the hold is freed
--
-- Nothing in this file expires a reserved or uncertain row. Age is only a
-- reporting threshold in ai_help.list_outstanding. Recovery is an explicit
-- service_role call to ai_help.resolve_model_call with a written reason:
--   release  after confirming the provider did not charge
--   settle   to book verified tokens on the original period, even if that
--            period then sits above its ceiling and blocks further calls
--
-- The reserve call passes a server-side input ceiling. That ceiling is one
-- token per UTF-8 byte of the prepared prompt, plus overhead for each message.
-- Prices are fixed here at 0.25 USD / 1M input and 2 USD / 1M output.
-- Output billing includes reasoning tokens. When reasoning is greater than
-- output, both are added. Otherwise the larger of the two is billed.
-- A normal settlement whose tokens fit inside the reservation cannot raise
-- settled spend above that period's ceiling. A larger reported use is stored
-- as a deviation and the hold stays until resolve_model_call.
--
-- This file creates the schema from scratch. It has not been applied. Do not
-- run it on a database that already has an older draft of these tables.

create schema if not exists ai_help;

revoke all on schema ai_help from public, anon, authenticated;
grant usage on schema ai_help to service_role;

create table if not exists ai_help.cost_lock (
  singleton boolean primary key default true check (singleton)
);

insert into ai_help.cost_lock (singleton) values (true) on conflict do nothing;

create table if not exists ai_help.budget_period (
  id uuid primary key default gen_random_uuid(),
  period_started_at timestamptz not null,
  period_ends_at timestamptz not null,
  budget_sek numeric(14, 6) not null check (budget_sek > 0),
  settled_sek numeric(14, 6) not null default 0 check (settled_sek >= 0),
  constraint ai_help_period_order check (period_ends_at > period_started_at)
);

create table if not exists ai_help.reservation (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references ai_help.budget_period (id),
  user_hash text not null,
  hold_sek numeric(14, 6) not null check (hold_sek > 0),
  max_input_tokens integer not null check (max_input_tokens > 0),
  max_output_tokens integer not null check (max_output_tokens between 1 and 400),
  sek_per_usd numeric(14, 6) not null check (sek_per_usd > 0),
  status text not null check (status in ('reserved', 'uncertain', 'settled', 'released')),
  input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  actual_sek numeric(14, 6),
  release_reason text,
  created_at timestamptz not null,
  closed_at timestamptz,
  constraint ai_help_reservation_hash check (user_hash ~ '^[0-9a-f]{24}$')
);

create table if not exists ai_help.user_window (
  user_hash text not null,
  window_started_at timestamptz not null,
  window_seconds integer not null check (window_seconds > 0),
  user_limit integer not null check (user_limit > 0),
  call_count integer not null check (call_count >= 0),
  primary key (user_hash, window_started_at),
  constraint ai_help_user_window_hash check (user_hash ~ '^[0-9a-f]{24}$')
);

create table if not exists ai_help.usage_event (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references ai_help.reservation (id),
  period_id uuid not null references ai_help.budget_period (id),
  user_hash text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  reasoning_tokens integer not null check (reasoning_tokens >= 0),
  actual_sek numeric(14, 6) not null check (actual_sek >= 0),
  recorded_at timestamptz not null default clock_timestamp(),
  constraint ai_help_usage_hash check (user_hash ~ '^[0-9a-f]{24}$')
);

create table if not exists ai_help.cost_deviation (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references ai_help.reservation (id),
  period_id uuid not null references ai_help.budget_period (id),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  reasoning_tokens integer not null check (reasoning_tokens >= 0),
  reported_sek numeric(14, 6) not null check (reported_sek >= 0),
  created_at timestamptz not null default clock_timestamp()
);

alter table ai_help.cost_lock enable row level security;
alter table ai_help.budget_period enable row level security;
alter table ai_help.reservation enable row level security;
alter table ai_help.user_window enable row level security;
alter table ai_help.usage_event enable row level security;
alter table ai_help.cost_deviation enable row level security;

revoke all on table ai_help.cost_lock from public, anon, authenticated;
revoke all on table ai_help.budget_period from public, anon, authenticated;
revoke all on table ai_help.reservation from public, anon, authenticated;
revoke all on table ai_help.user_window from public, anon, authenticated;
revoke all on table ai_help.usage_event from public, anon, authenticated;
revoke all on table ai_help.cost_deviation from public, anon, authenticated;

create or replace function ai_help.reserve_model_call(
  p_user_hash text,
  p_budget_sek numeric,
  p_period_seconds integer,
  p_user_limit integer,
  p_window_seconds integer,
  p_max_input_tokens integer,
  p_max_output_tokens integer,
  p_sek_per_usd numeric
) returns jsonb
language plpgsql
security definer
set search_path = ai_help, pg_temp
as $$
<<reserve_call>>
declare
  v_now timestamptz := clock_timestamp();
  period_row ai_help.budget_period%rowtype;
  window_row ai_help.user_window%rowtype;
  open_hold numeric(14, 6);
  hold_sek numeric(14, 6);
  created_id uuid;
begin
  if p_user_hash is null or p_user_hash !~ '^[0-9a-f]{24}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_hash');
  end if;
  if p_period_seconds is null or p_period_seconds < 1
    or p_user_limit is null or p_user_limit < 1
    or p_window_seconds is null or p_window_seconds < 1
    or p_max_input_tokens is null or p_max_input_tokens < 1
    or p_max_output_tokens is null or p_max_output_tokens < 1 or p_max_output_tokens > 400
    or p_sek_per_usd is null or p_sek_per_usd <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;

  hold_sek := round(
    (p_max_input_tokens * 0.25 + p_max_output_tokens * 2) / 1000000 * p_sek_per_usd,
    6
  );
  if hold_sek <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_hold');
  end if;

  perform 1 from ai_help.cost_lock where singleton for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'store_unavailable');
  end if;

  select * into period_row
    from ai_help.budget_period
    where period_started_at <= v_now and period_ends_at > v_now
    order by period_started_at desc
    limit 1
    for update;

  if not found then
    if p_budget_sek is null or p_budget_sek <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'budget_not_configured');
    end if;
    insert into ai_help.budget_period (period_started_at, period_ends_at, budget_sek)
    values (v_now, v_now + make_interval(secs => p_period_seconds), p_budget_sek)
    returning * into period_row;
  elsif p_budget_sek is not null and p_budget_sek > 0 and p_budget_sek < period_row.budget_sek then
    update ai_help.budget_period
      set budget_sek = p_budget_sek
      where id = period_row.id
      returning * into period_row;
  end if;

  select * into window_row
    from ai_help.user_window
    where user_hash = p_user_hash
      and window_started_at + make_interval(secs => window_seconds) > v_now
    order by window_started_at desc
    limit 1
    for update;

  if not found then
    insert into ai_help.user_window (
      user_hash, window_started_at, window_seconds, user_limit, call_count
    ) values (
      p_user_hash, v_now, p_window_seconds, p_user_limit, 0
    ) returning * into window_row;
  elsif p_user_limit < window_row.user_limit then
    update ai_help.user_window
      set user_limit = p_user_limit
      where user_hash = window_row.user_hash
        and window_started_at = window_row.window_started_at
      returning * into window_row;
  end if;

  if window_row.call_count >= window_row.user_limit then
    return jsonb_build_object(
      'ok', false,
      'reason', 'user_limit',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (
        window_row.window_started_at + make_interval(secs => window_row.window_seconds) - v_now
      ))))
    );
  end if;

  select coalesce(sum(r.hold_sek), 0) into open_hold
    from ai_help.reservation r
    where r.period_id = period_row.id
      and r.status in ('reserved', 'uncertain');

  if period_row.settled_sek + open_hold + hold_sek > period_row.budget_sek then
    return jsonb_build_object(
      'ok', false,
      'reason', 'budget',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (period_row.period_ends_at - v_now))))
    );
  end if;

  update ai_help.user_window
    set call_count = call_count + 1
    where user_hash = window_row.user_hash
      and window_started_at = window_row.window_started_at;

  insert into ai_help.reservation (
    period_id, user_hash, hold_sek, max_input_tokens, max_output_tokens,
    sek_per_usd, status, created_at
  ) values (
    period_row.id, p_user_hash, reserve_call.hold_sek, p_max_input_tokens, p_max_output_tokens,
    p_sek_per_usd, 'reserved', v_now
  ) returning id into created_id;

  return jsonb_build_object(
    'ok', true,
    'reservationId', created_id,
    'periodId', period_row.id,
    'holdSek', hold_sek
  );
end;
$$;

create or replace function ai_help.settle_model_call(
  p_reservation_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer,
  p_recovery boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ai_help, pg_temp
as $$
<<settle_call>>
declare
  v_now timestamptz := clock_timestamp();
  reservation_row ai_help.reservation%rowtype;
  billable bigint;
  actual_sek numeric(14, 6);
begin
  if p_input_tokens is null or p_input_tokens < 0
    or p_output_tokens is null or p_output_tokens < 0
    or p_reasoning_tokens is null or p_reasoning_tokens < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_usage');
  end if;

  perform 1 from ai_help.cost_lock where singleton for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'store_unavailable');
  end if;
  select * into reservation_row
    from ai_help.reservation
    where id = p_reservation_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing_reservation');
  end if;

  if p_reasoning_tokens::bigint > p_output_tokens::bigint then
    billable := p_output_tokens::bigint + p_reasoning_tokens::bigint;
  else
    billable := greatest(p_output_tokens::bigint, p_reasoning_tokens::bigint);
  end if;
  actual_sek := round(
    (p_input_tokens * 0.25 + billable * 2) / 1000000 * reservation_row.sek_per_usd,
    6
  );

  if reservation_row.status = 'settled' then
    if reservation_row.input_tokens = p_input_tokens
      and reservation_row.output_tokens = p_output_tokens
      and reservation_row.reasoning_tokens = p_reasoning_tokens then
      return jsonb_build_object('ok', true, 'duplicate', true, 'actualSek', reservation_row.actual_sek);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  if p_input_tokens > reservation_row.max_input_tokens
    or billable > reservation_row.max_output_tokens
    or actual_sek > reservation_row.hold_sek then
    if p_recovery then
      update ai_help.reservation
        set status = 'settled',
            input_tokens = p_input_tokens,
            output_tokens = p_output_tokens,
            reasoning_tokens = p_reasoning_tokens,
            actual_sek = settle_call.actual_sek,
            closed_at = v_now
        where id = reservation_row.id;
      update ai_help.budget_period
        set settled_sek = settled_sek + actual_sek
        where id = reservation_row.period_id;
      insert into ai_help.usage_event (
        reservation_id, period_id, user_hash, input_tokens, output_tokens, reasoning_tokens, actual_sek
      ) values (
        reservation_row.id, reservation_row.period_id, reservation_row.user_hash,
        p_input_tokens, p_output_tokens, p_reasoning_tokens, settle_call.actual_sek
      );
      insert into ai_help.cost_deviation (
        reservation_id, period_id, input_tokens, output_tokens, reasoning_tokens, reported_sek
      ) values (
        reservation_row.id, reservation_row.period_id,
        p_input_tokens, p_output_tokens, p_reasoning_tokens, actual_sek
      );
      return jsonb_build_object('ok', true, 'periodId', reservation_row.period_id, 'actualSek', actual_sek);
    end if;

    if reservation_row.status = 'reserved' then
      update ai_help.reservation set status = 'uncertain' where id = reservation_row.id;
    end if;
    if not exists (
      select 1 from ai_help.cost_deviation
      where reservation_id = reservation_row.id
        and input_tokens = p_input_tokens
        and output_tokens = p_output_tokens
        and reasoning_tokens = p_reasoning_tokens
    ) then
      insert into ai_help.cost_deviation (
        reservation_id, period_id, input_tokens, output_tokens, reasoning_tokens, reported_sek
      ) values (
        reservation_row.id, reservation_row.period_id,
        p_input_tokens, p_output_tokens, p_reasoning_tokens, actual_sek
      );
    end if;
    return jsonb_build_object('ok', false, 'reason', 'cost_deviation', 'reservationId', reservation_row.id);
  end if;

  if reservation_row.status not in ('reserved', 'uncertain')
    and not (p_recovery and reservation_row.status = 'released') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  update ai_help.reservation
    set status = 'settled',
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        reasoning_tokens = p_reasoning_tokens,
        actual_sek = settle_call.actual_sek,
        closed_at = v_now
    where id = reservation_row.id;
  update ai_help.budget_period
    set settled_sek = settled_sek + actual_sek
    where id = reservation_row.period_id;
  insert into ai_help.usage_event (
    reservation_id, period_id, user_hash, input_tokens, output_tokens, reasoning_tokens, actual_sek
  ) values (
    reservation_row.id, reservation_row.period_id, reservation_row.user_hash,
    p_input_tokens, p_output_tokens, p_reasoning_tokens, settle_call.actual_sek
  );
  return jsonb_build_object('ok', true, 'periodId', reservation_row.period_id, 'actualSek', actual_sek);
end;
$$;

create or replace function ai_help.mark_model_call_uncertain(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ai_help, pg_temp
as $$
declare
  reservation_row ai_help.reservation%rowtype;
begin
  perform 1 from ai_help.cost_lock where singleton for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'store_unavailable');
  end if;
  select * into reservation_row from ai_help.reservation where id = p_reservation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing_reservation');
  end if;
  if reservation_row.status = 'uncertain' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'reservationId', reservation_row.id);
  end if;
  if reservation_row.status <> 'reserved' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  update ai_help.reservation set status = 'uncertain' where id = reservation_row.id;
  return jsonb_build_object('ok', true, 'reservationId', reservation_row.id);
end;
$$;

create or replace function ai_help.resolve_model_call(
  p_reservation_id uuid,
  p_action text,
  p_reason text,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_reasoning_tokens integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ai_help, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  reservation_row ai_help.reservation%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 12 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  if p_action = 'settle' then
    return ai_help.settle_model_call(
      p_reservation_id, p_input_tokens, p_output_tokens, p_reasoning_tokens, true
    );
  end if;
  if p_action <> 'release' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;

  perform 1 from ai_help.cost_lock where singleton for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'store_unavailable');
  end if;
  select * into reservation_row from ai_help.reservation where id = p_reservation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing_reservation');
  end if;
  if reservation_row.status = 'released' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if reservation_row.status not in ('reserved', 'uncertain') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  update ai_help.reservation
    set status = 'released',
        release_reason = btrim(p_reason),
        closed_at = v_now
    where id = reservation_row.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function ai_help.list_outstanding(p_older_than_seconds integer default 120)
returns jsonb
language plpgsql
security definer
set search_path = ai_help, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_older_than_seconds is null or p_older_than_seconds < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  perform 1 from ai_help.cost_lock where singleton for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'store_unavailable');
  end if;
  return jsonb_build_object(
    'ok', true,
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reservationId', id,
        'periodId', period_id,
        'userHash', user_hash,
        'status', status,
        'holdSek', hold_sek,
        'createdAt', created_at
      ) order by created_at)
      from ai_help.reservation
      where status in ('reserved', 'uncertain')
        and created_at <= v_now - make_interval(secs => p_older_than_seconds)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function ai_help.reserve_model_call(
  text, numeric, integer, integer, integer, integer, integer, numeric
) from public, anon, authenticated;
revoke all on function ai_help.settle_model_call(uuid, integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function ai_help.mark_model_call_uncertain(uuid) from public, anon, authenticated;
revoke all on function ai_help.resolve_model_call(uuid, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function ai_help.list_outstanding(integer) from public, anon, authenticated;

create or replace function public.ai_help_reserve_model_call(
  p_user_hash text,
  p_budget_sek numeric,
  p_period_seconds integer,
  p_user_limit integer,
  p_window_seconds integer,
  p_max_input_tokens integer,
  p_max_output_tokens integer,
  p_sek_per_usd numeric
) returns jsonb
language sql
security definer
set search_path = ai_help, pg_temp
as $$
  select ai_help.reserve_model_call(
    p_user_hash, p_budget_sek, p_period_seconds, p_user_limit, p_window_seconds,
    p_max_input_tokens, p_max_output_tokens, p_sek_per_usd
  );
$$;

create or replace function public.ai_help_settle_model_call(
  p_reservation_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer
) returns jsonb
language sql
security definer
set search_path = ai_help, pg_temp
as $$
  select ai_help.settle_model_call(
    p_reservation_id, p_input_tokens, p_output_tokens, p_reasoning_tokens, false
  );
$$;

create or replace function public.ai_help_mark_model_call_uncertain(p_reservation_id uuid)
returns jsonb
language sql
security definer
set search_path = ai_help, pg_temp
as $$
  select ai_help.mark_model_call_uncertain(p_reservation_id);
$$;

create or replace function public.ai_help_resolve_model_call(
  p_reservation_id uuid,
  p_action text,
  p_reason text,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_reasoning_tokens integer default 0
) returns jsonb
language sql
security definer
set search_path = ai_help, pg_temp
as $$
  select ai_help.resolve_model_call(
    p_reservation_id, p_action, p_reason, p_input_tokens, p_output_tokens, p_reasoning_tokens
  );
$$;

create or replace function public.ai_help_list_outstanding_reservations(
  p_older_than_seconds integer default 120
) returns jsonb
language sql
security definer
set search_path = ai_help, pg_temp
as $$
  select ai_help.list_outstanding(p_older_than_seconds);
$$;

revoke all on function public.ai_help_reserve_model_call(
  text, numeric, integer, integer, integer, integer, integer, numeric
) from public, anon, authenticated;
revoke all on function public.ai_help_settle_model_call(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_help_mark_model_call_uncertain(uuid) from public, anon, authenticated;
revoke all on function public.ai_help_resolve_model_call(uuid, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_help_list_outstanding_reservations(integer) from public, anon, authenticated;

grant execute on function public.ai_help_reserve_model_call(
  text, numeric, integer, integer, integer, integer, integer, numeric
) to service_role;
grant execute on function public.ai_help_settle_model_call(uuid, integer, integer, integer) to service_role;
grant execute on function public.ai_help_mark_model_call_uncertain(uuid) to service_role;
grant execute on function public.ai_help_resolve_model_call(uuid, text, text, integer, integer, integer) to service_role;
grant execute on function public.ai_help_list_outstanding_reservations(integer) to service_role;
