import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./migrations/20260929130000_ai_help_shared_cost.sql', import.meta.url), 'utf8')

function tableColumns(source) {
  const tables = new Map()
  const starts = /create table if not exists ai_help\.([a-z_]+)\s*\(/gi
  for (const match of source.matchAll(starts)) {
    let depth = 1
    let index = match.index + match[0].length
    while (index < source.length && depth > 0) {
      if (source[index] === '(') depth += 1
      else if (source[index] === ')') depth -= 1
      index += 1
    }
    const columns = new Set()
    for (const line of source.slice(match.index + match[0].length, index - 1).split('\n')) {
      const column = line.trim().match(/^([a-z_][a-z0-9_]*)\s+[a-z]/)
      if (column) columns.add(column[1])
    }
    tables.set(match[1], columns)
  }
  return tables
}

function plpgsqlNameConflicts(source) {
  const tables = tableColumns(source)
  const conflicts = []
  const functions = source.matchAll(/create or replace function (ai_help\.\w+)\s*\(([\s\S]*?)\)\s*returns jsonb\s*language plpgsql[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi)
  for (const match of functions) {
    const body = match[3]
    const declareAt = body.search(/\bdeclare\b/i)
    const beginAt = body.search(/\bbegin\b/i)
    const variables = new Set([
      ...match[2].matchAll(/\b(p_[a-z0-9_]+)\s+/g).map((item) => item[1]),
      ...body.slice(declareAt, beginAt).matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gm).map((item) => item[1]),
    ])
    for (const part of body.slice(beginAt).split(';')) {
      const commandAt = part.search(/\b(select|insert\s+into|update|perform|delete\s+from)\b/i)
      if (commandAt < 0) continue
      const statement = part.slice(commandAt)
      const usedTables = [...statement.matchAll(/ai_help\.([a-z_]+)/g)].map((item) => item[1])
      if (usedTables.length === 0) continue
      const columns = new Set(usedTables.flatMap((name) => [...(tables.get(name) || [])]))
      const expressions = statement
        .replace(/insert\s+into\s+ai_help\.[a-z_]+\s*\([^)]*\)/gi, ' ')
        .replace(/\bset\b([\s\S]*?)(\bwhere\b|$)/gi, (_full, assignments, where) => `${assignments.replace(/\b[a-z_][a-z0-9_]*\s*=/gi, ' ')} ${where}`)
      for (const name of expressions.matchAll(/(^|[^.\w])([a-z_][a-z0-9_]*)\b/g)) {
        if (variables.has(name[2]) && columns.has(name[2])) {
          conflicts.push(`${match[1]}: ${name[2]}`)
        }
      }
    }
  }
  return conflicts
}

describe('AI Help shared cost migration', () => {
  it('keeps the ledger in its own schema and away from client roles', () => {
    expect(sql).toContain('create schema if not exists ai_help')
    expect(sql).toContain('for update')
    expect(sql).toContain('enable row level security')
    expect(sql).toMatch(/revoke all on schema ai_help from public, anon, authenticated/i)
    expect(sql).toMatch(/revoke all on function public\.ai_help_reserve_model_call/i)
    expect(sql).toMatch(/grant execute on function public\.ai_help_reserve_model_call[\s\S]*to service_role/i)
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*to\s+anon/i)
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)[\s\S]*to\s+(anon|authenticated)/i)
  })

  it('uses the database clock and does not free a reservation that can still cost money', () => {
    expect(sql).toContain('clock_timestamp()')
    expect(sql).toContain('uncertain')
    expect(sql).toContain('cost_deviation')
    expect(sql).toContain('resolve_model_call')
    expect(sql).not.toContain('p_now')
    expect(sql).not.toContain('p_hold_sek')
    expect(sql).not.toContain('p_actual_sek')
    const reserve = sql.slice(
      sql.indexOf('function ai_help.reserve_model_call'),
      sql.indexOf('function ai_help.settle_model_call'),
    )
    expect(reserve).not.toContain("status = 'released'")
    expect(reserve).toContain("status in ('reserved', 'uncertain')")
  })

  it('qualifies column names that share a PL/pgSQL variable name', () => {
    expect(sql).toContain('sum(r.hold_sek)')
    expect(sql).toContain('from ai_help.reservation r')
    expect(sql).not.toContain('sum(hold_sek)')
    expect(plpgsqlNameConflicts(sql)).toEqual([])
  })

  it('stores a hash and token usage, not a billing account', () => {
    expect(sql).toContain('user_hash')
    expect(sql).toContain('usage_event')
    expect(sql).toContain('input_tokens')
    expect(sql).toContain('output_tokens')
    const statements = sql.replace(/^--.*$/gm, '')
    expect(statements).not.toMatch(/\buser_id\b|auth\.users|billing_|sumup|subscription/i)
    expect(sql).toContain('Do not apply to staging or production')
  })
})