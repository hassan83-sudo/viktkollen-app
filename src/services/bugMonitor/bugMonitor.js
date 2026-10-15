import { resolveBugMonitorStore } from './bugMonitorStore.js'

const ERROR_TYPES = new Set([
  'ai-help',
  'auth',
  'chunkLoad',
  'conflict',
  'import',
  'network',
  'permission',
  'rateLimit',
  'render',
  'server',
  'storage',
  'timeout',
  'unknown',
  'validation',
])

const FEATURES = new Set([
  'ai-coach',
  'ai-help',
  'app',
  'auth',
  'billing',
  'body-scan',
  'camera',
  'food-scan',
  'other',
])

const SOURCES = new Set(['ai-help', 'backend', 'frontend'])
const SEVERITIES = new Set(['high', 'low', 'medium'])
const HIGH_ERROR_TYPES = new Set(['chunkLoad', 'conflict', 'render', 'server', 'storage'])

const DEFAULT_LIMITS = Object.freeze({
  dedupeMs: 60 * 1000,
  hourlyCap: 30,
  maxReports: 400,
})

function limitsFrom(context) {
  return {
    ...DEFAULT_LIMITS,
    ...(context.limits || {}),
  }
}

function cleanToken(value, allow, fallback) {
  const text = String(value || '').trim()
  return allow.has(text) ? text : fallback
}

function cleanVersion(value) {
  const text = String(value || 'unknown').trim().slice(0, 32)
  return /^[0-9A-Za-z._-]+$/.test(text) ? text : 'unknown'
}

function cleanFingerprint(value, errorType) {
  const text = String(value || '').trim().slice(0, 48)
  if (/^[a-z][a-z0-9-]{3,47}$/.test(text) && text.startsWith(errorType)) return text
  return `${errorType}-group`
}

function cleanTime(value, now) {
  const parsed = Date.parse(value)
  const current = now.getTime()
  if (!Number.isFinite(parsed)) return now.toISOString()
  if (parsed > current + 5 * 60 * 1000) return now.toISOString()
  if (current - parsed > 7 * 24 * 60 * 60 * 1000) return now.toISOString()
  return new Date(parsed).toISOString()
}

function severityFor(errorType, requested) {
  const severity = cleanToken(requested, SEVERITIES, 'medium')
  if (severity === 'high' && !HIGH_ERROR_TYPES.has(errorType)) return 'medium'
  return severity
}

export function sanitizeBugReport(input, context = {}) {
  const now = context.now instanceof Date ? context.now : new Date()
  const source = context.source || input?.source
  const errorType = cleanToken(input?.errorType, ERROR_TYPES, 'unknown')
  const report = {
    appVersion: cleanVersion(input?.appVersion),
    environment: {
      release: cleanToken(context.release, new Set(['development', 'local', 'preview', 'production']), 'local'),
      runtime: source === 'backend' ? 'server' : 'browser',
    },
    errorType,
    feature: cleanToken(input?.feature, FEATURES, 'app'),
    fingerprint: cleanFingerprint(input?.fingerprint, errorType),
    occurredAt: cleanTime(input?.occurredAt, now),
    severity: severityFor(errorType, input?.severity),
    source: cleanToken(source, SOURCES, 'frontend'),
  }

  return {
    ok: true,
    report,
  }
}

function createStore() {
  const reports = []
  const acknowledged = new Set()
  return {
    acknowledge(fingerprint) {
      if (!reports.some((report) => report.fingerprint === fingerprint)) return false
      acknowledged.add(fingerprint)
      return true
    },
    isAcknowledged(fingerprint) {
      return acknowledged.has(fingerprint)
    },
    list() {
      return reports.map((report) => ({ ...report, environment: { ...report.environment } }))
    },
    push(report, maxReports) {
      reports.push(report)
      while (reports.length > maxReports) reports.shift()
    },
    reset() {
      reports.length = 0
      acknowledged.clear()
    },
  }
}

const store = createStore()

export function resetBugMonitorForTests() {
  store.reset()
}

export function listBugReports() {
  return store.list()
}

export function acceptBugReport(input, context = {}) {
  return acceptInto(store, input, context)
}

function acceptInto(state, input, context = {}) {
  const limits = limitsFrom(context)
  const now = context.now instanceof Date ? context.now : new Date()
  const sanitized = sanitizeBugReport(input, { ...context, now })
  const actorKey = String(context.actorKey || 'anonymous').slice(0, 64)
  const current = state.list()
  const hourAgo = now.getTime() - 60 * 60 * 1000
  const recentForActor = current.filter((report) => report.actorKey === actorKey && Date.parse(report.receivedAt) >= hourAgo)
  if (recentForActor.length >= limits.hourlyCap) {
    return { code: 'RATE_LIMITED', ok: false }
  }

  const duplicate = recentForActor.some((report) => (
    report.fingerprint === sanitized.report.fingerprint
    && now.getTime() - Date.parse(report.receivedAt) < limits.dedupeMs
  ))
  if (duplicate) {
    return { duplicate: true, fingerprint: sanitized.report.fingerprint, ok: true, stored: false }
  }

  state.push({
    ...sanitized.report,
    actorKey,
    receivedAt: now.toISOString(),
  }, limits.maxReports)
  return { fingerprint: sanitized.report.fingerprint, ok: true, stored: true }
}

export function createMemoryBugMonitorStore() {
  const state = createStore()
  return {
    durable: false,
    kind: 'memory',
    accept(input, context = {}) {
      return acceptInto(state, input, context)
    },
    acknowledge(fingerprint) {
      const clean = String(fingerprint || '')
      if (!/^[a-z][a-z0-9-]{3,47}$/.test(clean)) return false
      return state.acknowledge(clean)
    },
    reset() {
      state.reset()
    },
    summary() {
      return summarizeBugReports(state.list(), {
        acknowledged: (fingerprint) => state.isAcknowledged(fingerprint),
      })
    },
  }
}

export function recordServerBug(input = {}) {
  try {
    const durableStore = resolveBugMonitorStore()
    if (!durableStore) return { code: 'STORE_UNAVAILABLE', ok: false }
    return durableStore.accept({
      appVersion: input.appVersion || 'server',
      errorType: input.errorType || 'server',
      feature: input.feature || 'app',
      fingerprint: input.fingerprint,
      severity: input.severity || 'high',
      source: 'backend',
    }, {
      actorKey: 'server',
      now: input.now instanceof Date ? input.now : new Date(),
      release: input.release,
      source: 'backend',
    })
  } catch {
    return { ok: false }
  }
}

function severityRank(severity) {
  if (severity === 'high') return 3
  if (severity === 'medium') return 2
  return 1
}

export function summarizeBugReports(reports = store.list(), { acknowledged = store.isAcknowledged.bind(store) } = {}) {
  const groups = new Map()
  reports.forEach((report) => {
    const current = groups.get(report.fingerprint) || {
      affected: new Set(),
      appVersion: report.appVersion,
      count: 0,
      errorType: report.errorType,
      feature: report.feature,
      fingerprint: report.fingerprint,
      latestAt: report.occurredAt,
      severity: report.severity,
      source: report.source,
    }
    current.affected.add(report.actorKey)
    current.count += 1
    if (report.occurredAt > current.latestAt) {
      current.appVersion = report.appVersion
      current.latestAt = report.occurredAt
      current.source = report.source
    }
    if (severityRank(report.severity) > severityRank(current.severity)) current.severity = report.severity
    groups.set(report.fingerprint, current)
  })

  const listed = [...groups.values()]
    .map((group) => {
      const recurring = group.count >= 2 || group.affected.size >= 2
      const status = acknowledged(group.fingerprint) ? 'acknowledged' : (recurring ? 'recurring' : 'new')
      return {
        affectedCount: group.affected.size,
        appVersion: group.appVersion,
        count: group.count,
        errorType: group.errorType,
        feature: group.feature,
        fingerprint: group.fingerprint,
        latestAt: group.latestAt,
        severity: group.severity,
        source: group.source,
        status,
      }
    })
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt))
    .slice(0, 40)

  return {
    acknowledgedCount: listed.filter((group) => group.status === 'acknowledged').length,
    affectedCount: new Set(reports.map((report) => report.actorKey)).size,
    groups: listed,
    newCount: listed.filter((group) => group.status === 'new').length,
    recurringCount: listed.filter((group) => group.status === 'recurring').length,
  }
}

export function acknowledgeBugGroup(fingerprint) {
  const clean = String(fingerprint || '')
  if (!/^[a-z][a-z0-9-]{3,47}$/.test(clean)) return false
  return store.acknowledge(clean)
}

export function planBugInvestigation(group) {
  if (!group?.fingerprint) return { code: 'UNKNOWN_GROUP', ok: false }
  const branch = `fix/bug-${group.fingerprint}`.replace(/[^a-z0-9/-]/g, '').slice(0, 72)
  return {
    approvalRequired: ['create_branch', 'run_tests'],
    automatic: {
      databaseChange: false,
      merge: false,
      productionDeploy: false,
    },
    forbiddenWithoutApproval: ['database_change', 'merge', 'production_deploy'],
    ok: true,
    proposal: {
      branch,
      investigate: `Granska ${group.feature} för fel ${group.fingerprint}.`,
      suggestedChange: 'Föreslå en kodrättning i den separata grenen efter godkännande.',
      tests: ['npx vitest run src/services/bugMonitor/bugMonitor.test.js'],
    },
  }
}

export const bugMonitorLimits = DEFAULT_LIMITS
