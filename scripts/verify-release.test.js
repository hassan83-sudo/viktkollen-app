import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getSpawnTarget } from './verify-release.js'

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

    expect(source).toContain('CoachPlanCenter')
    expect(source).toContain('NutritionCoachCenter')
    expect(source).toContain('PredictionCenter')
    expect(source).toContain('HealthJourneyCenter')
    expect(source).toContain('healthJourneyBuilder')
    expect(source).toContain('HabitGoalCenter')
  })
})
