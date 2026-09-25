/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import ImportModeDialog from './ImportModeDialog.jsx'
import NoteDialog from './NoteDialog.jsx'

// A11Y-8X2 (8M B13): the dialogs that replace the last browser prompts, and
// a permanent gate: no production file calls window.prompt. The real focus
// trap, Escape and focus return are proven in Chromium
// (tests/a11y/remaining-prompts.spec.js).

const root = resolve(process.cwd(), 'src')

function productionFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return productionFiles(path)
    return /\.(jsx?|tsx?)$/.test(name) && !/\.test\.|\.spec\./.test(name) ? [path] : []
  })
}

// window.prompt(...) or a bare prompt(...) call; not obj.prompt() (for
// example the PWA install event) and not comments.
function promptCalls(code) {
  const withoutComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  return withoutComments.match(/\bwindow\s*\.\s*prompt\s*\(|(?<![\w.$])prompt\s*\(/g) || []
}

describe('remaining prompts (8M B13)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
  })
  afterEach(cleanup)

  it('prompt zero-gate: no production file calls window.prompt', () => {
    const offenders = productionFiles(root).filter((path) => promptCalls(readFileSync(path, 'utf8')).length > 0).map((path) => relative(root, path))
    expect(offenders).toEqual([])
    // The gate itself finds a call and ignores the PWA API and comments.
    expect(promptCalls("const a = window.prompt('x')")).toHaveLength(1)
    expect(promptCalls("const a = prompt('x')")).toHaveLength(1)
    expect(promptCalls('await promptEvent.prompt()\n// window.prompt(')).toHaveLength(0)
  })

  it('import mode: a named modal with a labelled radio group, merge preselected and focused', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ImportModeDialog summary="Importen innehåller 2 måltider." onCancel={onCancel} onConfirm={onConfirm} />)
    const dialog = screen.getByRole('dialog', { name: 'Importera säkerhetskopia' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe('Importen innehåller 2 måltider.')
    const group = screen.getByRole('group', { name: 'Hur ska importen läggas in?' })
    const merge = screen.getByRole('radio', { name: 'Slå ihop med befintlig data' })
    const replace = screen.getByRole('radio', { name: 'Ersätt befintlig data' })
    expect(group.contains(merge) && group.contains(replace)).toBe(true)
    expect(merge.checked).toBe(true)
    expect(document.activeElement).toBe(merge)

    fireEvent.click(screen.getByRole('button', { name: 'Importera' }))
    expect(onConfirm).toHaveBeenLastCalledWith('merge')
    fireEvent.click(replace)
    expect(replace.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Importera' }))
    expect(onConfirm).toHaveBeenLastCalledWith('replace')
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('note: a labelled textarea with the current note; Save sends the text, also an empty one', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<NoteDialog initialNote="morgon" onCancel={onCancel} onSave={onSave} />)
    expect(screen.getByRole('dialog', { name: 'Redigera anteckning' })).toBeTruthy()
    const field = screen.getByRole('textbox', { name: 'Anteckning' })
    expect(field.tagName).toBe('TEXTAREA')
    expect(field.value).toBe('morgon')
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: 'kväll' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    expect(onSave).toHaveBeenLastCalledWith('kväll')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    expect(onSave).toHaveBeenLastCalledWith('')
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
