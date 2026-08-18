import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')

describe('App release initial state', () => {
  it('starts without demo weights, meals or chat messages', () => {
    expect(appSource).toMatch(/const starterWeights = \[\]/)
    expect(appSource).toMatch(/const initialMeals = \[\]/)
    expect(appSource).toMatch(/const initialChatMessages = \[\]/)
  })

  it('keeps food checklist and reminder opt-in empty by default', () => {
    expect(appSource).toMatch(/id:\s*'protein'[\s\S]*?done:\s*false/)
    expect(appSource).toMatch(/id:\s*'veg'[\s\S]*?done:\s*false/)
    expect(appSource).toMatch(/weight:\s*false/)
    expect(appSource).toMatch(/meal:\s*false/)
    expect(appSource).toMatch(/water:\s*false/)
  })

  it('stores check-in empty defaults as missing values', () => {
    expect(appSource).toMatch(/energy:\s*null/)
    expect(appSource).toMatch(/steps:\s*null/)
    expect(appSource).toContain("mood: ''")
  })
})
