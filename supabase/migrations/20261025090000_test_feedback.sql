-- Testfeedback inför lansering. Samma säkerhetsmodell som support.tickets:
-- privat schema, RLS på, inga rättigheter för anon/authenticated. Bara den
-- autentiserade server-API:n (service_role) anropar kommandona, med det
-- användar-ID som servern verifierat. Inga bilder lagras.
-- Schemat exponeras inte i Data API; som Security Center nås det via två
-- public-bryggor som bara service_role får köra.
begin;
create schema if not exists test_feedback;
revoke all on schema test_feedback from public, anon, authenticated;
grant usage on schema test_feedback to service_role;

create table test_feedback.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  features text[] not null check (cardinality(features) between 1 and 22),
  category text not null check (category in (
    'not_working','crash','slow','hard_to_understand','wrong_result','bad_design',
    'hard_to_read','button_broken','missing_feature','suggestion','other')),
  rating text check (rating in ('very_good','good','partly','poor','not_at_all')),
  comment text not null default '' check (char_length(comment) <= 4000),
  app_version text not null default '' check (char_length(app_version) <= 40),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  admin_note text not null default '' check (char_length(admin_note) <= 2000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);
alter table test_feedback.reports enable row level security;
revoke all on test_feedback.reports from public, anon, authenticated;
grant select, insert, update on test_feedback.reports to service_role;
create index test_feedback_reports_status on test_feedback.reports (status, created_at desc);
create index test_feedback_reports_owner on test_feedback.reports (user_id, created_at desc);

create function test_feedback.allowed_features() returns text[]
language sql immutable set search_path = '' as $$
  select array['home','auth','profile','food_scan','food_diary','food_bank','ai_coach','ai_help',
    'ai_eye','body_scan','wardrobe','weight','progress','journey','place','stallet','reminders',
    'navigation','design','speed','billing','other']::text[];
$$;

create function test_feedback.customer_command(p_actor uuid, p_action text, p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare report test_feedback.reports; request_key uuid; feature_list text[]; note text; rating_value text;
begin
  if p_actor is null then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if p_action <> 'create' then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  begin
    request_key := (p_body->>'requestId')::uuid;
  exception when others then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end;
  if request_key is null or jsonb_typeof(p_body->'features') <> 'array' then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  select coalesce(array_agg(distinct value), '{}') into feature_list
    from jsonb_array_elements_text(p_body->'features') as value;
  if cardinality(feature_list) not between 1 and 22
    or not (feature_list <@ test_feedback.allowed_features()) then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  note := trim(coalesce(p_body->>'comment',''));
  rating_value := nullif(p_body->>'rating','');
  if char_length(note) > 4000 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  -- Per användare i tur och ordning: omförsök kan inte skapa dubbletter och
  -- parallella anrop kan inte gå förbi gränserna.
  perform pg_advisory_xact_lock(hashtextextended('test_feedback:' || p_actor::text, 0));
  select * into report from test_feedback.reports where user_id = p_actor and request_id = request_key;
  if found then return jsonb_build_object('ok',true,'duplicate',true,'report',to_jsonb(report) - 'user_id' - 'request_id' - 'admin_note'); end if;
  if (select count(*) from test_feedback.reports where user_id = p_actor and created_at > now() - interval '1 day') >= 30
    or exists (select 1 from test_feedback.reports where user_id = p_actor and created_at > now() - interval '10 seconds') then
    return jsonb_build_object('ok',false,'code','RATE_LIMITED');
  end if;
  insert into test_feedback.reports (user_id, request_id, features, category, rating, comment, app_version)
    values (p_actor, request_key, feature_list, p_body->>'category', rating_value, note,
      left(coalesce(p_body->>'appVersion',''), 40))
    returning * into report;
  return jsonb_build_object('ok',true,'report',to_jsonb(report) - 'user_id' - 'request_id' - 'admin_note');
exception
  when check_violation then return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
end;
$$;

create function test_feedback.admin_command(p_actor uuid, p_action text, p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare report test_feedback.reports; report_key uuid;
begin
  if not coalesce(billing.has_billing_admin(p_actor),false) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if p_action = 'list' then
    return jsonb_build_object('ok',true,
      'summary', jsonb_build_object(
        'total', (select count(*) from test_feedback.reports),
        'open', (select count(*) from test_feedback.reports where status in ('open','in_progress')),
        'resolved', (select count(*) from test_feedback.reports where status = 'resolved'),
        'closed', (select count(*) from test_feedback.reports where status = 'closed'),
        'topFeatures', coalesce((select jsonb_agg(jsonb_build_object('feature',feature,'count',total,'open',open_total) order by total desc, feature)
          from (select feature, count(*) as total, count(*) filter (where r.status in ('open','in_progress')) as open_total
            from test_feedback.reports r, unnest(r.features) as feature group by feature order by total desc, feature limit 10) f),'[]'::jsonb),
        'categories', coalesce((select jsonb_object_agg(category,total)
          from (select category, count(*) as total from test_feedback.reports group by category) c),'{}'::jsonb),
        'ratings', coalesce((select jsonb_object_agg(rating,total)
          from (select rating, count(*) as total from test_feedback.reports where rating is not null group by rating) g),'{}'::jsonb)
      ),
      'reports', coalesce((select jsonb_agg(to_jsonb(t) - 'request_id' order by t.created_at desc)
        from (select r.*, u.email as user_email from test_feedback.reports r
          left join auth.users u on u.id = r.user_id
          order by r.created_at desc limit 500) t),'[]'::jsonb));
  end if;
  if p_action <> 'update' then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  begin
    report_key := (p_body->>'reportId')::uuid;
  exception when others then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end;
  if coalesce(p_body->>'status','') not in ('open','in_progress','resolved','closed')
    or char_length(coalesce(p_body->>'adminNote','')) > 2000 then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  select * into report from test_feedback.reports where id = report_key for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if p_body->>'version' is null or report.version <> (p_body->>'version')::integer then
    return jsonb_build_object('ok',false,'code','CONFLICT');
  end if;
  update test_feedback.reports set status = p_body->>'status', admin_note = trim(coalesce(p_body->>'adminNote','')),
    version = version + 1, updated_at = now()
    where id = report.id returning * into report;
  return jsonb_build_object('ok',true,'report',to_jsonb(report) - 'request_id');
end;
$$;

revoke all on function test_feedback.allowed_features() from public, anon, authenticated;
revoke all on function test_feedback.customer_command(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function test_feedback.admin_command(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function test_feedback.allowed_features(), test_feedback.customer_command(uuid,text,jsonb),
  test_feedback.admin_command(uuid,text,jsonb) to service_role;

create function public.test_feedback_customer_command(p_actor uuid, p_action text, p_body jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
  select test_feedback.customer_command(p_actor, p_action, p_body);
$$;
create function public.test_feedback_admin_command(p_actor uuid, p_action text, p_body jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
  select test_feedback.admin_command(p_actor, p_action, p_body);
$$;
revoke all on function public.test_feedback_customer_command(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.test_feedback_admin_command(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.test_feedback_customer_command(uuid,text,jsonb),
  public.test_feedback_admin_command(uuid,text,jsonb) to service_role;
commit;
