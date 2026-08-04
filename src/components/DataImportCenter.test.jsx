import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DataImportCenter from './DataImportCenter.jsx'

describe('DataImportCenter', () => {
  it('renders a safe preview-first import entry point', () => {
    const html = renderToStaticMarkup(<DataImportCenter userId="u1" />)

    expect(html).toContain('Dataimport')
    expect(html).toContain('förhandsgranskning')
    expect(html).toContain('Välj fil')
    expect(html).toContain('aria-label="Välj Viktkollen-backup eller CSV-fil för säker import"')
  })

  it('does not render raw technical values in the initial UI', () => {
    const html = renderToStaticMarkup(<DataImportCenter />)

    expect(html).not.toMatch(/\b(?:undefined|null|NaN|Infinity|\[object Object\]|true|false)\b/)
  })
})
