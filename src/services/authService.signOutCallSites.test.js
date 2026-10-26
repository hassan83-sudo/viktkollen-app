import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceDir = dirname(fileURLToPath(import.meta.url))

describe('sign-out call sites', () => {
  const appSource = readFileSync(join(sourceDir, '../App.jsx'), 'utf8')
  const moreSource = readFileSync(join(sourceDir, '../components/sections/MoreSection.jsx'), 'utf8')
  const authPanelSource = readFileSync(join(sourceDir, '../components/AuthPanel.jsx'), 'utf8')
  const authSource = readFileSync(join(sourceDir, 'authService.js'), 'utf8')

  it('keeps Logga ut local and account deletion plus password recovery global', () => {
    expect(appSource).toContain('const { error } = await signOut()')
    expect(appSource).toContain('await signOutAllSessions()')
    expect(appSource).toContain('onSignOut={handleSignOut}')
    expect(appSource).toContain('onAccountDeleted={handleAccountDeleted}')
    expect(moreSource).toContain('onClick={onSignOut}')
    expect(moreSource).toContain('await onAccountDeleted?.()')
    expect(moreSource).not.toContain('await onSignOut?.()')
    expect(authPanelSource).toContain('completePasswordRecovery(password)')
    expect(authPanelSource).not.toContain('signOutAllSessions')
    expect(authSource).toContain("supabase.auth.signOut({ scope: 'local' })")
    expect(authSource).toContain("supabase.auth.signOut({ scope: 'global' })")
    expect(authSource).toContain('const signOutResult = await signOutAllSessions()')
  })
})
