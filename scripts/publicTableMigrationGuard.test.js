import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkMigration, checkMigrationDirectory } from './publicTableMigrationGuard.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function missing(sql, table) {
  return checkMigration('fixture.sql', sql).filter((item) => item.table === table).map((item) => item.missing)
}

describe('SUPABASE-30OCT-C1 public table migration guard', () => {
  it('accepts an authenticated minimum grant with RLS and a matching policy', () => {
    const sql = `
      create table if not exists public.notes (id uuid, user_id uuid);
      revoke all on table public.notes from public, anon, authenticated, service_role;
      grant select, update on table public.notes to authenticated;
      alter table public.notes enable row level security;
      create policy notes_owner on public.notes for all to authenticated
        using (auth.uid() = user_id) with check (auth.uid() = user_id);
    `
    expect(checkMigration('notes.sql', sql)).toEqual([])
  })

  it('accepts a documented service-only table without client access', () => {
    const sql = `
      -- public-table-security: service-only secret_audit
      -- From the Supabase 30 October behavior change, new public tables
      -- must not rely on automatic Data API grants.
      create table public.secret_audit (id text);
      revoke all on table public.secret_audit from public, anon, authenticated;
      grant select on table public.secret_audit to service_role;
    `
    expect(checkMigration('audit.sql', sql)).toEqual([])
  })

  it('accepts anon select only when RLS and a select policy exist', () => {
    const sql = `
      create table if not exists "public"."board" (id uuid, enabled boolean);
      revoke all on table public.board from public, anon, authenticated;
      grant select on table public.board to anon;
      grant select, insert, delete on table public.board to authenticated;
      alter table public.board enable row level security;
      alter table public.board force row level security;
      create policy board_read on public.board for select to anon, authenticated using (enabled = true);
      create policy board_insert on public.board for insert to authenticated with check (created_by = auth.uid());
      create policy board_delete on public.board for delete to authenticated using (created_by = auth.uid());
    `
    expect(checkMigration('board.sql', sql)).toEqual([])
  })

  it('ignores billing tables and the B4 hardening migration', () => {
    expect(checkMigration('billing.sql', 'create table if not exists billing.plans (plan_id text);')).toEqual([])
    expect(checkMigration('private.sql', 'create table private.user_backup_keys (user_id uuid);')).toEqual([])
    const findings = checkMigrationDirectory(join(root, 'supabase/migrations'))
    expect(findings.filter((item) => item.file === '20260924110000_public_table_minimum_privileges.sql')).toEqual([])
    expect(findings).toEqual([])
  })

  it('fails a public table with no privilege intent', () => {
    const sql = 'create table public.exposed (id text);'
    expect(missing(sql, 'exposed').join(' ')).toMatch(/GRANT or REVOKE/)
    expect(checkMigration('exposed.sql', sql)[0].message).toMatch(/explicit Data API privilege, RLS and policy review/)
  })

  it('fails a public table that relies on default grants', () => {
    const sql = `
      -- automatic default grants are enough
      create table if not exists public.legacy (id text);
    `
    expect(missing(sql, 'legacy').join(' ')).toMatch(/automatic Data API grants/)
  })

  it('fails grants without RLS', () => {
    const sql = `
      create table public.notes (id text, user_id uuid);
      revoke all on table public.notes from anon;
      grant select on table public.notes to authenticated;
      create policy notes_read on public.notes for select to authenticated using (auth.uid() = user_id);
    `
    expect(missing(sql, 'notes').join(' ')).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })

  it('fails authenticated access without a policy', () => {
    const sql = `
      create table public.notes (id text, user_id uuid);
      grant select on table public.notes to authenticated;
      alter table public.notes enable row level security;
    `
    expect(missing(sql, 'notes').join(' ')).toMatch(/authenticated SELECT/)
  })

  it('fails anon CRUD when the policy does not cover the writes', () => {
    const sql = `
      create table public.board (id text);
      grant select, insert, update, delete on table public.board to anon;
      alter table public.board enable row level security;
      create policy board_read on public.board for select to anon using (true);
    `
    const text = missing(sql, 'board').join(' ')
    expect(text).toMatch(/USING \(true\)/)
    expect(text).toMatch(/anon INSERT/)
    expect(text).not.toMatch(/GRANT ALL TO authenticated/i)
  })

  it('fails closed when a public CREATE TABLE cannot be classified', () => {
    const findings = checkMigration('dynamic.sql', "create table public. ;")
    expect(findings[0].message).toMatch(/explicit Data API privilege, RLS and policy review/)
    expect(findings[0].missing).toMatch(/Manual security review is required/)
  })
})
