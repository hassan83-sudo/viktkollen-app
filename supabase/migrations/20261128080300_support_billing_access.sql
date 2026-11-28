create or replace function support.customer_command(p_actor uuid, p_action text, p_body jsonb default '{}') returns jsonb
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
  msg := trim(coalesce(p_body->>'message',''));
  if length(msg) not between 1 and 2000 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  -- Serialize per customer: retries cannot duplicate tickets/alerts and parallel requests cannot bypass limits.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text, 0));
  if p_action = 'create' then
    if not eligible and coalesce(p_body->>'category','') <> 'billing' then return jsonb_build_object('ok',false,'code','PAID_SUPPORT_REQUIRED'); end if;
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
    if not eligible and ticket.category <> 'billing' then return jsonb_build_object('ok',false,'code','PAID_SUPPORT_REQUIRED'); end if;
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

