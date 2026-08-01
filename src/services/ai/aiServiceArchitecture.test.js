import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeRecentCoachChatHistory } from './aiChatController.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const appSource = () => readFileSync(resolve(projectRoot, 'src/App.jsx'), 'utf8')
const loaderSource = () => readFileSync(resolve(projectRoot, 'src/services/ai/aiRuntimeLoader.js'), 'utf8')

describe('AI service architecture', () => {
  it('keeps heavy AI services out of App static imports', () => {
    const source = appSource()
    const disallowedStaticImports = [
      './lib/coachReply.js',
      './services/aiApiService.js',
      './services/aiConversationMemory.js',
      './services/aiCoach/coachAppContext.js',
      './services/aiCoachDeterministicReplies.js',
      './services/aiCoachV2Service.js',
      './services/aiSuggestions.js',
      './services/aiUserContext.js',
      './services/mealAnalysisService.js',
      './services/proactiveCoachService.js',
      './services/weeklyReportService.js',
    ]

    disallowedStaticImports.forEach((modulePath) => {
      expect(source).not.toContain(`from '${modulePath}'`)
    })
  })

  it('uses a single runtime loader as App AI entry point', () => {
    const source = appSource()

    expect(source).toContain("from './services/ai/aiRuntimeLoader.js'")
    expect(source).toContain("from './services/ai/aiChatController.js'")
  })

  it('keeps dynamic imports analyzable with static module paths', () => {
    const source = loaderSource()

    expect(source).toContain("import('../aiCoach/coachAppContext.js')")
    expect(source).toContain("import('../aiCoachDeterministicReplies.js')")
    expect(source).toContain("import('../aiCoachV2Service.js')")
    expect(source).not.toMatch(/import\([^'"][^)]+?\)/)
  })

  it('limits coach chat context to the latest 10 messages', () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      createdAt: `2026-07-${String(index + 1).padStart(2, '0')}`,
      id: index + 1,
      role: index % 2 === 0 ? 'user' : 'assistant',
      source: 'mock',
      text: `Meddelande ${index + 1}`,
    }))

    const recent = makeRecentCoachChatHistory(history)

    expect(recent).toHaveLength(10)
    expect(recent[0].text).toBe('Meddelande 3')
    expect(recent.at(-1).text).toBe('Meddelande 12')
    expect(recent[0]).not.toHaveProperty('id')
    expect(recent[0]).not.toHaveProperty('source')
  })
})
