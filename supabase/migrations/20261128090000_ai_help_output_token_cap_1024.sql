-- AI Help: raise the per-call output token cap from 400 to 1024.
-- Matches AI_HELP_DEFAULT_MAX_OUTPUT_TOKENS in api/_shared/aiHelp/costGuard.js.
-- Idempotent: the reservation function is only rewritten where it still has
-- the old 400 cap, so databases already updated by hand are left as they are.

alter table ai_help.reservation
  drop constraint if exists reservation_max_output_tokens_check;

alter table ai_help.reservation
  add constraint reservation_max_output_tokens_check
  check (max_output_tokens between 1 and 1024);

do $$
declare
  fn record;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ai_help'
      and p.proname = 'reserve_model_call'
      and p.prokind = 'f'
      and p.prosrc like '%p_max_output_tokens > 400%'
  loop
    execute replace(
      pg_get_functiondef(fn.oid),
      'p_max_output_tokens > 400',
      'p_max_output_tokens > 1024'
    );
  end loop;
end
$$;
