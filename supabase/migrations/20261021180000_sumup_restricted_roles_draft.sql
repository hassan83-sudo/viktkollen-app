-- DRAFT ONLY. NEVER APPLY TO STAGING OR PRODUCTION WITHOUT REVIEW.
-- Database access separation for the renewal settlement boundary.
-- This script intentionally creates NO LOGIN, password, credential, or API grant.
-- The deployment administrator must separately provision an isolated server-only
-- login, review its role membership, and keep it outside PostgREST exposure.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'sumup_renewal_facts_reader') then
    create role sumup_renewal_facts_reader nologin noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'sumup_renewal_settlement_writer') then
    create role sumup_renewal_settlement_writer nologin noinherit;
  end if;
end;
$$;

-- These roles have no direct table permissions and no schema CREATE.
revoke all on schema billing from sumup_renewal_facts_reader, sumup_renewal_settlement_writer;
grant usage on schema billing to sumup_renewal_facts_reader, sumup_renewal_settlement_writer;

-- Reader may access only the reviewed read-only snapshot function.
grant execute on function billing.read_sumup_renewal_facts_draft(text, timestamptz)
  to sumup_renewal_facts_reader;

-- The writer's EXECUTE grant is deliberately NOT included here.
-- The SQL function cannot attest to a PAID checkout by itself.
-- Granting writer access requires a separately audited settlement boundary.
revoke all on function billing.commit_verified_sumup_renewal(
  text, text, timestamptz, text, timestamptz
) from public, anon, authenticated, service_role, sumup_renewal_facts_reader,
       sumup_renewal_settlement_writer;
