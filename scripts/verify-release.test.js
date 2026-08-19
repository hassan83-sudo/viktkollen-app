import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getSpawnTarget } from './verify-release.js'

const releaseCandidateSource = readFileSync(new URL('./validate-release-candidate.js', import.meta.url), 'utf8')

describe('verify-release script contract', () => {
  it('uses the npm cli entrypoint when the script is launched by npm', () => {
    expect(getSpawnTarget('npm', ['run', 'build'], {
      env: { npm_execpath: 'C:\\node\\npm-cli.js' },
      nodePath: 'C:\\node\\node.exe',
      platform: 'win32',
    })).toEqual({
      args: ['C:\\node\\npm-cli.js', 'run', 'build'],
      command: 'C:\\node\\node.exe',
    })
  })

  it('falls back to npm.cmd on Windows without requiring shell execution', () => {
    expect(getSpawnTarget('npm', ['test'], {
      env: {},
      platform: 'win32',
    })).toEqual({
      args: ['test'],
      command: 'npm.cmd',
    })
  })

  it('keeps non-npm commands unchanged', () => {
    expect(getSpawnTarget('git', ['diff', '--check'], {
      env: {},
      platform: 'win32',
    })).toEqual({
      args: ['diff', '--check'],
      command: 'git',
    })
  })

  it('keeps coach and prediction centers out of initial release preloads', () => {
    const source = readFileSync(new URL('./verify-release.js', import.meta.url), 'utf8')

    expect(source).toContain('src/services/entitlements.js')
    expect(source).toContain('api/entitlements/index.js')
    expect(source).toContain('api/account-deletion/index.js')
    expect(source).toContain('supabase/entitlements_and_account_deletion.sql')
    expect(source).toContain('docs/supabase-staging-runbook.md')
    expect(source).toContain('docs/vercel-staging-env-runbook.md')
    expect(source).toContain('src/services/accountDeletionReadiness.js')
    expect(source).toContain('CoachPlanCenter')
    expect(source).toContain('NutritionCoachCenter')
    expect(source).toContain('PredictionCenter')
    expect(source).toContain('HealthJourneyCenter')
    expect(source).toContain('healthJourneyBuilder')
    expect(source).toContain('HabitGoalCenter')
  })

  it('provides a non-mutating release candidate validator', () => {
    expect(releaseCandidateSource).toContain("['npm', ['run', 'validate:staging']")
    expect(releaseCandidateSource).toContain("['npm', ['run', 'test:e2e']")
    expect(releaseCandidateSource).toContain('assertDistContract()')
    expect(releaseCandidateSource).not.toContain('writeReleaseMarker')
  })

  it('runs E2E through the controlled list reporter runner', () => {
    const e2eRunnerSource = readFileSync(new URL('./run-e2e.js', import.meta.url), 'utf8')

    expect(e2eRunnerSource).toContain("'--reporter=list'")
    expect(e2eRunnerSource).toContain('stopProcessTree(preview)')
  })
})
