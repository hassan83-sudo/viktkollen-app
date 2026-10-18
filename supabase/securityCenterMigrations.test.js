import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const directory = new URL('./migrations/', import.meta.url)
const migrations = readdirSync(directory)
  .filter((name) => /^\d+_security_center_.*\.sql$/.test(name))
  .sort()
  .map((name) => ({ name, sql: readFileSync(new URL(name, directory), 'utf8') }))

async function database() {
  const db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  return db
}

describe('Security Center migration dependencies', () => {
  it('installs in filename order on a clean database and keeps privileged aggregation private', async () => {
    const db = await database()
    try {
      for (const migration of migrations) await db.exec(migration.sql)
      const { rows } = await db.query(`
        select public.security_center_record_event('API_RATE_LIMITED','medium','migration_test') as id;
      `)
      await db.query("select public.security_center_record_event('API_RATE_LIMITED','medium','migration_test')")
      const events = await db.query('select * from public.security_center_recent_events(50)')
      expect(events.rows).toHaveLength(1)
      expect(events.rows[0]).toMatchObject({ id: rows[0].id, event_count: 2, feature: 'migration_test' })
      const permissions = await db.query(`
        select
          has_function_privilege('anon','public.security_center_recent_events(integer)','EXECUTE') as anon_read,
          has_function_privilege('authenticated','public.security_center_recent_events(integer)','EXECUTE') as user_read,
          has_function_privilege('anon','public.security_center_record_event(text,text,text)','EXECUTE') as anon_write,
          has_function_privilege('authenticated','public.security_center_record_event(text,text,text)','EXECUTE') as user_write,
          has_table_privilege('anon','security_center.events','SELECT') as anon_table,
          has_table_privilege('authenticated','security_center.events','SELECT') as user_table,
          has_function_privilege('service_role','public.security_center_recent_events(integer)','EXECUTE') as server_read,
          has_function_privilege('service_role','public.security_center_record_event(text,text,text)','EXECUTE') as server_write
      `)
      expect(permissions.rows[0]).toEqual({ anon_read: false, user_read: false, anon_write: false, user_write: false, anon_table: false, user_table: false, server_read: true, server_write: true })
    } finally { await db.close() }
  }, 15000)

  it('preserves existing event IDs and timestamps when upgrading and reapplying aggregation', async () => {
    const db = await database()
    try {
      const aggregation = migrations.find(({ name }) => name.endsWith('_security_center_event_aggregation.sql'))
      for (const migration of migrations.filter((item) => item !== aggregation)) await db.exec(migration.sql)
      await db.exec(`insert into security_center.events(type,severity,feature,occurred_at)
        values('API_RATE_LIMITED','medium','existing_fixture','2026-10-01T00:00:00Z')`)
      const before = (await db.query('select id,occurred_at from security_center.events')).rows[0]
      await db.exec(aggregation.sql)
      const events = await db.query('select * from public.security_center_recent_events(50)')
      expect(events.rows).toHaveLength(1)
      expect(events.rows[0]).toMatchObject({ id: before.id, occurred_at: before.occurred_at, last_seen_at: before.occurred_at, event_count: 1 })
      await db.exec("update security_center.events set event_count=7, last_seen_at='2026-10-02T00:00:00Z'")
      const aggregated = (await db.query('select * from public.security_center_recent_events(50)')).rows
      await db.exec(aggregation.sql)
      expect((await db.query('select * from public.security_center_recent_events(50)')).rows).toEqual(aggregated)
    } finally { await db.close() }
  }, 15000)
})
