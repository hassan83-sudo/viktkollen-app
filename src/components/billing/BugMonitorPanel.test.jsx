/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BugMonitorPanel from './BugMonitorPanel.jsx'

describe('AI Bug Monitor panel', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows new, recurring, affected, severity and status while open', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path, options = {}) => {
      if (options.method === 'POST') {
        return {
          json: async () => ({
            ok: true,
            plan: {
              automatic: { databaseChange: false, merge: false, productionDeploy: false },
              ok: true,
              proposal: {
                branch: 'fix/bug-render-abcd1234',
                suggestedChange: 'Föreslå en kodrättning i den separata grenen efter godkännande.',
                tests: ['npx vitest run src/services/bugMonitor/bugMonitor.test.js'],
              },
            },
          }),
          ok: true,
        }
      }
      expect(String(path)).toBe('/api/bug-monitor')
      expect(options.headers.Authorization).toBe('Bearer admin-token')
      return {
        json: async () => ({
          ok: true,
          storage: 'memory',
          summary: {
            affectedCount: 4,
            groups: [{
              affectedCount: 2,
              count: 3,
              errorType: 'render',
              feature: 'app',
              fingerprint: 'render-abcd1234',
              latestAt: '2026-10-15T08:00:00.000Z',
              severity: 'high',
              status: 'recurring',
            }],
            newCount: 1,
            recurringCount: 2,
          },
        }),
        ok: true,
      }
    }))

    render(<BugMonitorPanel token="admin-token" />)
    fireEvent.click(screen.getByText('AI Bug Monitor'))
    expect(await screen.findByText('Översikten sparas i databasen. Bara en administratör kan läsa den.')).toBeTruthy()
    expect(screen.getByText('Nya fel 1')).toBeTruthy()
    expect(screen.getByText('Återkommande 2')).toBeTruthy()
    expect(screen.getAllByText('Drabbade 4').length).toBeGreaterThan(0)
    expect(screen.getByText('Hög')).toBeTruthy()
    expect(screen.getByText('Återkommande')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Förbered undersökning render-abcd1234' }))
    expect(await screen.findByText('Gren fix/bug-render-abcd1234')).toBeTruthy()
    expect(screen.getByText('Merge, produktionsdeploy och databasändring körs inte. De kräver ett senare godkännande.')).toBeTruthy()
    const post = globalThis.fetch.mock.calls.find((call) => call[1]?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({
      action: 'plan',
      fingerprint: 'render-abcd1234',
    })
  })
})