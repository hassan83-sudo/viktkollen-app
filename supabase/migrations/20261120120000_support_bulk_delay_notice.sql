-- Admin-only bulk delay notices; keep existing support queue and customer ownership rules.
begin;
create or replace function support.bulk_delay_notice(p_actor uuid, p_hours integer, p_ticket_ids uuid[] default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if not coalesce(billing.has_billing_admin(p_actor), false) then
    return jsonb_build_object('ok',false,'code','FORBIDDEN');
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 24 then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  if p_ticket_ids is not null and (cardinality(p_ticket_ids) < 1 or cardinality(p_ticket_ids) > 200) then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  update support.tickets t
  set thread = t.thread || jsonb_build_array(jsonb_build_object(
      'role','support',
      'message','Vi har för närvarande många supportärenden. Det kan därför dröja upp till ' ||
        p_hours::text || case when p_hours = 1 then ' timme' else ' timmar' end ||
        ' innan du får svar. Tack för ditt tålamod!',
      'at',now())),
      version = t.version + 1,
      updated_at = now()
  where t.id in (
    select id from support.tickets
    where status in ('open','in_progress')
      and jsonb_array_length(thread) < 50
      and (p_ticket_ids is null or id = any(p_ticket_ids))
    order by created_at
    limit 200
    for update skip locked
  );
  get diagnostics changed = row_count;
  return jsonb_build_object('ok',true,'sentCount',changed);
end;
$$;
revoke all on function support.bulk_delay_notice(uuid,integer,uuid[]) from public,anon,authenticated;
grant execute on function support.bulk_delay_notice(uuid,integer,uuid[]) to service_role;
commit;
