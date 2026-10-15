import { describe, expect, it } from 'vitest'
import { createMemoryBugMonitorStore } from './bugMonitor.js'
import { createPostgresBugMonitorStore, presentBugSummary } from './bugMonitorStore.js'

function sharedDatabase() {
  const database = createMemoryBugMonitorStore()
  const calls = []
  const client = {
    schema(name) {
      return {
        rpc: async (fn, args) => {
          calls.push({ args, fn, schema: name })
          if (fn === 'accept_report') {
            return {
              data: database.accept({
                appVersion: args.p_app_version,
                errorType: args.p_error_type,
                feature: args.p_feature,
                fingerprint: args.p_fingerprint,
                occurredAt: args.p_occurred_at,
                severity: args.p_severity,
                source: args.p_source,
              }, {
                actorKey: args.p_actor_key,
                release: args.p_release,
                source: args.p_source,
              }),
              error: null,
            }
          }
          if (fn === 'summary') return { data: database.summary(), error: null }
          return { data: null, error: { message: 'missing' } }
        },
      }
    },
  }
  return { calls, client, database }
}

const report = {
  chat: 'hemlig konversation',
  email: 'person@example.com',
  errorType: 'render',
  feature: 'app',
  fingerprint: 'render-abcd1234',
  image: 'data:image/jpeg;base64,AAAA',
  password: 'hunter2',
  severity: 'high',
  token: 'secret-token',
}

describe('durable bug monitor store', () => {
  it('shares one database between two server instances and drops sensitive fields', async () => {
    const { calls, client } = sharedDatabase()
    const firstInstance = createPostgresBugMonitorStore({ client })
    const secondInstance = createPostgresBugMonitorStore({ client })
    const context = { release: 'production' }

    const first = await firstInstance.accept(report, { ...context, actorKey: 'aaaaaaaaaaaaaaaa' })
    const duplicate = await firstInstance.accept(report, { ...context, actorKey: 'aaaaaaaaaaaaaaaa' })
    const second = await secondInstance.accept(report, { ...context, actorKey: 'bbbbbbbbbbbbbbbb' })
    const summary = await firstInstance.summary()

    expect(first.stored).toBe(true)
    expect(duplicate).toMatchObject({ duplicate: true, stored: false })
    expect(second.stored).toBe(true)
    expect(summary).toMatchObject({
      affectedCount: 2,
      recurringCount: 1,
    })
    expect(summary.groups[0].affectedCount).toBe(2)
    expect(calls.every((call) => call.schema === 'bug_monitor')).toBe(true)
    expect(JSON.stringify(calls)).not.toMatch(/hunter2|secret-token|person@example|base64|hemlig/)
    expect(JSON.stringify(summary)).not.toMatch(/aaaaaaaaaaaaaaaa|bbbbbbbbbbbbbbbb/)
    expect(firstInstance.durable).toBe(true)
    expect(firstInstance.kind).toBe('supabase')
  })

  it('removes actor keys from a database summary', () => {
    const summary = presentBugSummary({
      affectedCount: 1,
      groups: [{
        actorKey: 'aaaaaaaaaaaaaaaa',
        email: 'person@example.com',
        fingerprint: 'render-abcd1234',
        status: 'new',
      }],
      newCount: 1,
    })
    expect(JSON.stringify(summary)).not.toMatch(/aaaaaaaaaaaaaaaa|person@example/)
    expect(summary.groups[0]).toEqual({
      fingerprint: 'render-abcd1234',
      status: 'new',
    })
  })
})
