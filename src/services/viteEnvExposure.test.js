import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vite bygger in hela import.meta.env-objektet, med alla VITE_-variabler, i klientpaketet
// när koden läser det dynamiskt eller som helhet. Då kan en felaktigt namngiven hemlighet
// (till exempel VITE_SUPABASE_SERVICE_ROLE_KEY) nå webbläsaren. Bara statiska läsningar
// som import.meta.env.VITE_NAMN är tillåtna i klientkoden.
const SRC = new URL('..', import.meta.url).pathname
const FORBIDDEN = [
  /import\.meta\.env(\?\.)?\[/,
  /import\.meta\.env\s*[,);]/,
  /=\s*import\.meta\.env\s*$/m,
  /\.\.\.\s*import\.meta\.env/,
  /Object\.(keys|entries|values)\(\s*import\.meta\.env/,
]

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(js|jsx)$/.test(name) && !/\.test\.(js|jsx)$/.test(name) ? [path] : []
  })
}

describe('client environment exposure', () => {
  it('reads import.meta.env only with static names', () => {
    const offenders = sourceFiles(SRC).flatMap((path) => {
      const code = readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
      return FORBIDDEN.some((pattern) => pattern.test(code)) ? [relative(SRC, path)] : []
    })
    expect(offenders).toEqual([])
  })
})
