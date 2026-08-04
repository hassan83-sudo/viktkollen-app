import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DataExportCenter from './DataExportCenter.jsx'

describe('DataExportCenter', () => {
  it('renders a preview-first export and privacy summary', () => {
    const html = renderToStaticMarkup(<DataExportCenter userId="u1" />)

    expect(html).toContain('Dataexport')
    expect(html).toContain('Preview')
    expect(html).toContain('Ingår aldrig')
    expect(html).toContain('Ladda ned export')
  })

  it('does not render technical raw values on initial render', () => {
    const html = renderToStaticMarkup(<DataExportCenter />)

    expect(html).not.toMatch(/\b(?:undefined|null|NaN|Infinity|\[object Object\])\b/)
  })
})
