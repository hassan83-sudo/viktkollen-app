-- Staging-only test budget. Apply only to armtslzspuebmlysnooq.
-- Separate from AI Help/Coach: no shared counters or automatic reset.
create schema if not exists wardrobe_ai_preview;
revoke all on schema wardrobe_ai_preview from public, anon, authenticated;
grant usage on schema wardrobe_ai_preview to service_role;

create table wardrobe_ai_preview.budget (
  singleton boolean primary key default true check (singleton),
  budget_sek numeric(14,6) not null check (budget_sek > 0 and budget_sek <= 1),
  reserved_sek numeric(14,6) not null default 0 check (reserved_sek >= 0)
);
create table wardrobe_ai_preview.reservations (
  id uuid primary key default gen_random_uuid(),
  user_hash text not null check (user_hash ~ '^[0-9a-f]{24}$'),
  hold_sek numeric(14,6) not null check (hold_sek > 0),
  created_at timestamptz not null default now()
);
alter table wardrobe_ai_preview.budget enable row level security;
alter table wardrobe_ai_preview.reservations enable row level security;
revoke all on all tables in schema wardrobe_ai_preview from public, anon, authenticated;
grant select, insert, update on wardrobe_ai_preview.budget to service_role;
grant select, insert on wardrobe_ai_preview.reservations to service_role;

create function public.wardrobe_ai_reserve_preview_call(
  p_budget_sek numeric, p_call_sek numeric, p_user_hash text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  current_budget wardrobe_ai_preview.budget%rowtype;
  hold numeric(14,6);
  reservation uuid;
begin
  if p_budget_sek is null or p_budget_sek <= 0 or p_budget_sek > 1
    or p_call_sek is null or p_call_sek <= 0 or p_call_sek > p_budget_sek
    or p_user_hash is null or p_user_hash !~ '^[0-9a-f]{24}$' then
    return jsonb_build_object('ok', false, 'reason', 'configuration_required');
  end if;
  -- Round UP: a sub-micro-SEK value must not produce a zero-cost hold.
  hold := ceil(p_call_sek * 1000000) / 1000000;
  perform pg_advisory_xact_lock(712681232);
  insert into wardrobe_ai_preview.budget(singleton, budget_sek)
    values (true, p_budget_sek)
    on conflict (singleton) do update set budget_sek = least(wardrobe_ai_preview.budget.budget_sek, excluded.budget_sek);
  select * into current_budget from wardrobe_ai_preview.budget where singleton for update;
  if current_budget.reserved_sek + hold > current_budget.budget_sek then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;
  update wardrobe_ai_preview.budget set reserved_sek = reserved_sek + hold where singleton;
  insert into wardrobe_ai_preview.reservations(user_hash, hold_sek)
    values (p_user_hash, hold) returning id into reservation;
  return jsonb_build_object('ok', true, 'reservationId', reservation);
end;
$$;
revoke all on function public.wardrobe_ai_reserve_preview_call(numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.wardrobe_ai_reserve_preview_call(numeric, numeric, text) to service_role;
