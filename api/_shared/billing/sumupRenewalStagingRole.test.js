import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

const migration = () => readFile('supabase/migrations/20261024083855_sumup_renewal_staging_worker_role.sql', 'utf8')
const signatures = [
  'read_sumup_renewal_facts_draft(text, timestamptz)',
  'list_sumup_renewal_work_draft(integer)',
  'claim_sumup_renewal_attempt(text, text, timestamptz)',
  'bind_sumup_renewal_checkout_draft(text, text, text, timestamptz, timestamptz)',
  'commit_verified_sumup_renewal(text, text, timestamptz, text, timestamptz)',
  'record_verified_sumup_renewal_failure_draft(text, text, timestamptz, text)',
  'list_sumup_renewal_recovery_draft(integer)',
  'record_sumup_renewal_observation_draft(text, text, text, text, boolean)',
]

async function fixture() {
  const db = new PGlite()
  await db.exec('create schema billing; create table billing.protected_data(id integer);')
  for (const signature of signatures) {
    await db.exec(`create function billing.${signature} returns jsonb language sql as $$ select '{}'::jsonb $$;
      revoke all on function billing.${signature} from public;`)
  }
  return db
}

it('provisions only the eight RPC capabilities, with no login or table access', async () => {
  const db = await fixture()
  try {
    await db.exec(await migration())
    expect((await db.query("select rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolinherit from pg_roles where rolname='sumup_renewal_staging_worker'")).rows[0])
      .toEqual({ rolcanlogin: false, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolinherit: false })
    await db.exec('set role sumup_renewal_staging_worker')
    expect((await db.query('select billing.list_sumup_renewal_work_draft(0) as result')).rows[0].result).toEqual({})
    await expect(db.query('select * from billing.protected_data')).rejects.toThrow(/permission denied/)
    await expect(db.query('insert into billing.protected_data values (1)')).rejects.toThrow(/permission denied/)
    await expect(db.exec('create table billing.forbidden(id integer)')).rejects.toThrow(/permission denied/)
  } finally { await db.close() }
})

it('rolls back provisioning if PUBLIC already exposes a billing table', async () => {
  const db = await fixture()
  try {
    await db.exec('grant select on billing.protected_data to public; begin;')
    await expect(db.exec(await migration())).rejects.toThrow('renewal_staging_role_not_restricted')
    await db.exec('rollback')
    expect((await db.query("select count(*)::integer as count from pg_roles where rolname='sumup_renewal_staging_worker'")).rows[0].count).toBe(0)
  } finally { await db.close() }
})

it('applies the synchronized migration order including recovery before pending-plan repair', async () => {
  const db = new PGlite()
  try {
    for (const file of [
      'tests/billing/sumup-renewal-postgres-bootstrap.sql',
      'tests/billing/sumup-renewal-postgres-commit-bootstrap.sql',
      'tests/billing/sumup-renewal-postgres-failure-bootstrap.sql',
      'tests/billing/sumup-renewal-postgres-pending-bootstrap.sql',
      'tests/billing/sumup-renewal-postgres-recovery-bootstrap.sql',
      'supabase/migrations/20260924084000_billing_pending_plan_apply.sql',
      'supabase/migrations/20260926140000_billing_mark_renewal_failed.sql',
    ]) await db.exec(await readFile(file, 'utf8'))
    // The abbreviated lifecycle fixture omits the original subscriptions
    // migration's trigger-function ACL; mirror the already-verified Staging ACL.
    await db.exec('revoke all on function billing.guard_subscription_row() from public')
    const files = (await readdir('supabase/migrations'))
      .filter(file => /^20261024.*sumup_renewal.*\.sql$/.test(file)).sort()
    expect(files).toHaveLength(12)
    for (const file of files) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
    await db.exec('set role sumup_renewal_staging_worker')
    expect((await db.query('select * from billing.list_sumup_renewal_recovery_draft(0)')).rows).toEqual([])
    expect((await db.query('select * from billing.list_sumup_renewal_work_draft(0)')).rows).toEqual([])
    await expect(db.query('select * from billing.sumup_renewal_attempts')).rejects.toThrow(/permission denied/)
  } finally { await db.close() }
})
