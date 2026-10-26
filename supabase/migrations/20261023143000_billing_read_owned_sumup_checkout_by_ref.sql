-- Read-only lookup of one SumUp checkout intent by the SumUp checkout
-- reference and the owning account. Does not grant access, bind an
-- instrument, or change the intent. service_role may execute this
-- function only. The role still has no SELECT on the table.

create or replace function billing.read_owned_sumup_checkout_by_ref(
  p_provider_checkout_ref text,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.checkout_intents;
begin
  if p_user_id is null
     or p_provider_checkout_ref is null
     or p_provider_checkout_ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;

  select * into existing
  from billing.checkout_intents
  where provider = 'sumup'
    and provider_checkout_ref = p_provider_checkout_ref
    and user_id = p_user_id;

  if existing.checkout_id is null then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'checkout_id', existing.checkout_id,
    'plan_id', existing.plan_id,
    'provider', existing.provider,
    'provider_checkout_ref', existing.provider_checkout_ref,
    'status', existing.status,
    'user_id', existing.user_id
  );
end;
$$;

revoke all on function billing.read_owned_sumup_checkout_by_ref(text, uuid) from public, anon, authenticated, service_role;
grant execute on function billing.read_owned_sumup_checkout_by_ref(text, uuid) to service_role;
