-- Staging provisioning only. NOLOGIN and no password: never enables a worker.
-- Apply only after all reviewed renewal RPC migrations are installed.
do $role$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'sumup_renewal_staging_worker') then
    raise exception 'renewal_staging_role_already_exists';
  end if;
  create role sumup_renewal_staging_worker nologin noinherit nosuperuser
    nocreatedb nocreaterole noreplication nobypassrls connection limit 2;
end;
$role$;

grant usage on schema billing to sumup_renewal_staging_worker;
grant execute on function
  billing.read_sumup_renewal_facts_draft(text, timestamptz),
  billing.list_sumup_renewal_work_draft(integer),
  billing.claim_sumup_renewal_attempt(text, text, timestamptz),
  billing.bind_sumup_renewal_checkout_draft(text, text, text, timestamptz, timestamptz),
  billing.commit_verified_sumup_renewal(text, text, timestamptz, text, timestamptz),
  billing.record_verified_sumup_renewal_failure_draft(text, text, timestamptz, text),
  billing.list_sumup_renewal_recovery_draft(integer),
  billing.record_sumup_renewal_observation_draft(text, text, text, text, boolean)
to sumup_renewal_staging_worker;

alter role sumup_renewal_staging_worker set search_path = pg_catalog;
alter role sumup_renewal_staging_worker set statement_timeout = '15s';
alter role sumup_renewal_staging_worker set lock_timeout = '5s';

-- Refuse provisioning if inherited PUBLIC capabilities defeat the boundary.
do $verify$
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'billing' and c.relkind in ('r','p','v','m','f')
      and pg_catalog.has_table_privilege('sumup_renewal_staging_worker', c.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) or pg_catalog.has_schema_privilege('sumup_renewal_staging_worker', 'billing', 'CREATE')
    or exists (select 1 from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles worker on worker.rolname = 'sumup_renewal_staging_worker'
      join pg_catalog.pg_roles creator on creator.rolname = current_user
      -- PostgreSQL can automatically grant the creating administrator membership.
      -- The worker itself must never inherit any role; no other member is allowed.
      where m.member = worker.oid
        or (m.roleid = worker.oid and m.member <> creator.oid)) then
    raise exception 'renewal_staging_role_not_restricted';
  end if;
  if (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'billing'
        and pg_catalog.has_function_privilege('sumup_renewal_staging_worker', p.oid, 'EXECUTE')) <> 8 then
    raise exception 'renewal_staging_rpc_allowlist_mismatch';
  end if;
end;
$verify$;
