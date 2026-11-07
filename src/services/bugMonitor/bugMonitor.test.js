import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptBugReport,
  acknowledgeBugGroup,
  planBugInvestigation,
  recordServerBug,
  resetBugMonitorForTests,
  sanitizeBugReport,
  serverReleaseName,
  summarizeBugReports,
} from './bugMonitor.js'
import { buildClientBugPayload } from './bugMonitorClient.js'
import { setBugMonitorStoreForTests } from './bugMonitorStore.js'

const limits = { dedupeMs: 1000, hourlyCap: 2, maxReports: 10 }

describe('bug monitor reports', () => {
  afterEach(() => {
    resetBugMonitorForTests()
  })

  it('keeps only technical fields', () => {
    const sanitized = sanitizeBugReport({
      appVersion: '1.0.0',
      chat: 'hemlig konversation',
      email: 'person@example.com',
      errorType: 'render',
      feature: 'app',
      fingerprint: 'render-abcd1234',
      image: 'data:image/jpeg;base64,AAAA',
      message: 'lösenord och chatt',
      password: 'hunter2',
      severity: 'high',
      token: 'secret-token',
    }, { release: 'production' })

    const encoded = JSON.stringify(sanitized)
    expect(encoded).not.toMatch(/hunter2|secret-token|person@example|base64|hemlig|lösenord/)
    expect(sanitized.report).toMatchObject({
      appVersion: '1.0.0',
      environment: { release: 'production', runtime: 'browser' },
      errorType: 'render',
      feature: 'app',
      fingerprint: 'render-abcd1234',
      severity: 'high',
    })
    expect(sanitizeBugReport({
      errorType: 'ai-help',
      fingerprint: 'ai-help-manual',
      severity: 'high',
    }).report.severity).toBe('medium')
  })

  it('groups the same fingerprint across people and plans a blocked investigation', () => {
    const first = new Date('2026-10-15T10:00:00.000Z')
    const second = new Date('2026-10-15T10:05:00.000Z')
    const input = {
      appVersion: '1.0.0',
      errorType: 'render',
      feature: 'body-scan',
      fingerprint: 'render-abcd1234',
      severity: 'high',
    }
    expect(acceptBugReport(input, { actorKey: 'actor-one', limits, now: first }).stored).toBe(true)
    expect(acceptBugReport(input, { actorKey: 'actor-two', limits, now: second }).stored).toBe(true)

    const summary = summarizeBugReports()
    expect(summary.newCount).toBe(0)
    expect(summary.recurringCount).toBe(1)
    expect(summary.affectedCount).toBe(2)
    expect(summary.groups[0]).toMatchObject({
      affectedCount: 2,
      count: 2,
      severity: 'high',
      status: 'recurring',
    })
    expect(JSON.stringify(summary)).not.toContain('actor-one')

    const plan = planBugInvestigation(summary.groups[0])
    expect(plan.automatic).toEqual({
      databaseChange: false,
      merge: false,
      productionDeploy: false,
    })
    expect(plan.approvalRequired).toEqual(['create_branch', 'run_tests'])
    expect(plan.proposal.branch).toBe('fix/bug-render-abcd1234')

    expect(acknowledgeBugGroup('render-abcd1234')).toBe(true)
    expect(summarizeBugReports().groups[0].status).toBe('acknowledged')
    expect(summarizeBugReports().recurringCount).toBe(0)
  })

  it('stores and acknowledges a camelCase chunkLoad fingerprint', () => {
    const accepted = acceptBugReport({
      errorType: 'chunkLoad',
      feature: 'app',
      fingerprint: 'chunkLoad-local',
      severity: 'high',
    }, { actorKey: 'actor-one' })
    expect(accepted).toMatchObject({ fingerprint: 'chunkLoad-local', ok: true, stored: true })
    expect(acknowledgeBugGroup('chunkLoad-local')).toBe(true)
    expect(summarizeBugReports().groups[0].status).toBe('acknowledged')
  })

  it('limits repeated reports from the same actor', () => {
    const start = new Date('2026-10-15T10:00:00.000Z')
    const input = { errorType: 'network', feature: 'app', fingerprint: 'network-abcd1234' }
    expect(acceptBugReport(input, { actorKey: 'actor-one', limits, now: start }).stored).toBe(true)
    expect(acceptBugReport(input, {
      actorKey: 'actor-one',
      limits,
      now: new Date(start.getTime() + 500),
    })).toMatchObject({ duplicate: true, stored: false })
    expect(acceptBugReport({ ...input, fingerprint: 'network-efgh5678' }, {
      actorKey: 'actor-one',
      limits,
      now: new Date(start.getTime() + 2000),
    }).stored).toBe(true)
    expect(acceptBugReport({ ...input, fingerprint: 'network-ijkl9012' }, {
      actorKey: 'actor-one',
      limits,
      now: new Date(start.getTime() + 4000),
    })).toMatchObject({ code: 'RATE_LIMITED', ok: false })
  })

  it('builds a client payload without conversation text', () => {
    const payload = buildClientBugPayload({
      chat: 'hemlig fråga',
      errorType: 'ai-help',
      feature: 'ai-help',
      fingerprint: 'ai-help-manual',
      password: 'hunter2',
      source: 'ai-help',
    })
    expect(payload).toMatchObject({
      errorType: 'ai-help',
      feature: 'ai-help',
      fingerprint: 'ai-help-manual',
      source: 'ai-help',
    })
    expect(JSON.stringify(payload)).not.toMatch(/hemlig|hunter2/)
  })
})

describe('server bug release label', () => {
  afterEach(() => {
    setBugMonitorStoreForTests()
  })

  it('maps the Vercel environment to the stored release', () => {
    expect(serverReleaseName({ VERCEL_ENV: 'production' })).toBe('production')
    expect(serverReleaseName({ VERCEL_ENV: 'preview' })).toBe('preview')
    expect(serverReleaseName({ VERCEL_ENV: 'development' })).toBe('development')
    expect(serverReleaseName({})).toBe('local')
  })

  it('labels server errors in Production as production, not local', () => {
    const calls = []
    setBugMonitorStoreForTests({ accept: (input, context) => { calls.push(context); return { ok: true } } })
    const previous = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = 'production'
    try {
      recordServerBug({ fingerprint: 'server-providerunavaila' })
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previous
    }
    expect(calls).toHaveLength(1)
    expect(calls[0].release).toBe('production')
  })
})
