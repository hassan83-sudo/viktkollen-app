import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const MESSAGE = 'New public table requires explicit Data API privilege, RLS and policy review.'
const ROW_PRIVILEGES = new Set(['select', 'insert', 'update', 'delete'])
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

function finding(file, table, missing) {
  return { file, missing, message: MESSAGE, table }
}

function stripComments(sql) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2)
      if (end < 0) return { error: 'unterminated block comment' }
      out += ' '
      i = end + 2
      continue
    }
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i)
      i = end < 0 ? sql.length : end
      continue
    }
    const quote = sql[i]
    if (quote === "'") {
      out += quote
      i += 1
      while (i < sql.length) {
        out += sql[i]
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out += sql[i + 1]
          i += 2
          continue
        }
        if (sql[i] === "'") {
          i += 1
          break
        }
        i += 1
      }
      continue
    }
    const dollar = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/)
    if (dollar) {
      const token = dollar[0]
      const end = sql.indexOf(token, i + token.length)
      if (end < 0) return { error: 'unterminated dollar quote' }
      out += sql.slice(i, end + token.length)
      i = end + token.length
      continue
    }
    out += quote
    i += 1
  }
  return { sql: out }
}

function splitStatements(sql) {
  const statements = []
  let current = ''
  let i = 0
  while (i < sql.length) {
    const dollar = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/)
    if (dollar) {
      const token = dollar[0]
      const end = sql.indexOf(token, i + token.length)
      if (end < 0) return { error: 'unterminated dollar quote' }
      current += sql.slice(i, end + token.length)
      i = end + token.length
      continue
    }
    if (sql[i] === "'") {
      current += sql[i]
      i += 1
      while (i < sql.length) {
        current += sql[i]
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += sql[i + 1]
          i += 2
          continue
        }
        if (sql[i] === "'") {
          i += 1
          break
        }
        i += 1
      }
      continue
    }
    if (sql[i] === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      i += 1
      continue
    }
    current += sql[i]
    i += 1
  }
  if (current.trim()) statements.push(current.trim())
  return { statements }
}

function tablePattern(table) {
  const quoted = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:"public"|public)\\s*\\.\\s*(?:"${quoted}"|${quoted})\\b`, 'i')
}

function mentionsTable(statement, table) {
  return tablePattern(table).test(statement)
}

function createdTables(statements) {
  const tables = []
  const ambiguous = []
  const createRe = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([\s\S]*?)\s*\(/gi
  for (const statement of statements) {
    if (statement.includes('$') && /\bcreate\s+table\b/i.test(statement) && /\$[A-Za-z0-9_]*\$/.test(statement)) {
      const body = statement.replace(/^[\s\S]*?\$[A-Za-z0-9_]*\$/, ' ').replace(/\$[A-Za-z0-9_]*\$[\s\S]*$/, ' ')
      if (/\bcreate\s+table\b/i.test(body) === false && /\bcreate\s+table\b/i.test(statement)) {
        ambiguous.push('public CREATE TABLE inside a function or dynamic body')
        continue
      }
    }
    const before = tables.length + ambiguous.length
    createRe.lastIndex = 0
    let match = createRe.exec(statement)
    while (match) {
      const target = match[1].replace(/\s+/g, ' ').trim()
      const qualified = target.match(/^(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))\s*\.\s*(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))$/)
      if (!qualified) {
        ambiguous.push(target || 'unqualified CREATE TABLE')
      } else {
        const schema = (qualified[1] || qualified[2]).toLowerCase()
        const name = qualified[3] || qualified[4]
        if (schema === 'public') {
          if (!IDENTIFIER.test(name)) ambiguous.push(name)
          else tables.push(name)
        }
      }
      match = createRe.exec(statement)
    }
    const loosePublic = statement.match(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:"public"|public)\s*\.[^;()]*)/i)
    if (loosePublic && tables.length + ambiguous.length === before) {
      ambiguous.push(loosePublic[1].trim() || 'unparsed public CREATE TABLE')
    }
  }
  return { ambiguous, tables }
}

function privilegesFor(statement) {
  const match = statement.match(/\b(grant|revoke)\s+([\s\S]+?)\s+on\s+(?:table\s+)?/i)
  if (!match) return []
  const raw = match[2].toLowerCase().replace(/\s+/g, ' ')
  if (raw === 'all' || raw.startsWith('all privileges')) return ['all']
  return raw.split(',').map((part) => part.trim()).filter(Boolean)
}

function rolesFor(statement, keyword) {
  const match = statement.match(new RegExp(`\\b${keyword}\\s+([\\s\\S]+)$`, 'i'))
  if (!match) return []
  return match[1]
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
}

function policyCommands(statement) {
  if (/\busing\s*\(\s*true\s*\)/i.test(statement) || /\bwith\s+check\s*\(\s*true\s*\)/i.test(statement)) {
    return { permissive: true }
  }
  const command = statement.match(/\bfor\s+(all|select|insert|update|delete)\b/i)
  const name = command ? command[1].toLowerCase() : 'all'
  const commands = name === 'all' ? [...ROW_PRIVILEGES] : [name]
  return { commands, permissive: false }
}

function serviceOnlyTables(original) {
  const names = new Set()
  const marker = /public-table-security:\s*service-only\s+([a-z_][a-z0-9_]*)/gi
  let match = marker.exec(original)
  while (match) {
    names.add(match[1])
    match = marker.exec(original)
  }
  return names
}

export function checkMigration(file, original) {
  const stripped = stripComments(original)
  if (stripped.error) {
    return [finding(file, '(unparsed)', `SQL could not be classified safely (${stripped.error}). Manual security review is required.`)]
  }
  const split = splitStatements(stripped.sql)
  if (split.error) {
    return [finding(file, '(unparsed)', `SQL could not be classified safely (${split.error}). Manual security review is required.`)]
  }
  const { ambiguous, tables } = createdTables(split.statements)
  const findings = ambiguous.map((table) => finding(
    file,
    table,
    'SQL could not be classified safely. Manual security review is required.',
  ))
  const declaredServiceOnly = serviceOnlyTables(original)

  for (const table of tables) {
    const related = split.statements.filter((statement) => mentionsTable(statement, table))
    const grants = related.filter((statement) => /^\s*grant\b/i.test(statement))
    const revokes = related.filter((statement) => /^\s*revoke\b/i.test(statement))
    if (!grants.length && !revokes.length) {
      findings.push(finding(file, table, 'missing explicit GRANT or REVOKE intent. Do not rely on automatic Data API grants.'))
      continue
    }
    if (grants.some((statement) => privilegesFor(statement).includes('all'))) {
      findings.push(finding(file, table, 'GRANT ALL is not an explicit minimum-privilege decision.'))
    }

    const client = { anon: new Set(), authenticated: new Set() }
    for (const statement of grants) {
      const privileges = privilegesFor(statement).filter((privilege) => ROW_PRIVILEGES.has(privilege))
      for (const role of rolesFor(statement, 'to')) {
        if (client[role]) privileges.forEach((privilege) => client[role].add(privilege))
      }
    }

    const enabled = related.some((statement) => /\benable\s+row\s+level\s+security\b/i.test(statement))
    const serviceOnly = declaredServiceOnly.has(table)
      && client.anon.size === 0
      && client.authenticated.size === 0
      && revokes.some((statement) => /\banon\b/i.test(statement) && /\bauthenticated\b/i.test(statement))
    if (!enabled && !serviceOnly) {
      findings.push(finding(file, table, 'missing ENABLE ROW LEVEL SECURITY, or an explicit service-only security declaration with client access revoked.'))
    }

    const policies = related.filter((statement) => /^\s*create\s+policy\b/i.test(statement))
    const covered = new Set()
    for (const statement of policies) {
      const parsed = policyCommands(statement)
      if (parsed.permissive) {
        findings.push(finding(file, table, 'USING (true) or WITH CHECK (true) does not satisfy policy review.'))
        continue
      }
      parsed.commands.forEach((command) => covered.add(command))
    }
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of client[role]) {
        if (!covered.has(privilege)) {
          findings.push(finding(file, table, `missing explicit policy for ${role} ${privilege.toUpperCase()}.`))
        }
      }
    }
  }
  return findings
}

export function checkMigrationFiles(files) {
  return files.flatMap((file) => checkMigration(file.name, file.sql))
}

export function checkMigrationDirectory(directory) {
  const names = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()
  return checkMigrationFiles(names.map((name) => ({
    name,
    sql: readFileSync(join(directory, name), 'utf8'),
  })))
}

function printFindings(findings) {
  for (const item of findings) {
    console.error(`${MESSAGE}`)
    console.error(`migration: ${item.file}`)
    console.error(`table: ${item.table}`)
    console.error(`missing: ${item.missing}`)
  }
}

if (process.argv[1] && process.argv[1].endsWith('publicTableMigrationGuard.mjs')) {
  const directory = join(process.cwd(), 'supabase', 'migrations')
  const findings = checkMigrationDirectory(directory)
  if (findings.length) {
    printFindings(findings)
    process.exit(1)
  }
  console.log('public table migration guard: no findings')
}
