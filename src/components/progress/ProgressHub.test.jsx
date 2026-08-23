import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ProgressHub, { progressHubFolders, progressHubTargetFolders } from './ProgressHub.jsx'

describe('ProgressHub', () => {
  it('renders the compact Framstegscenter folders on the first level', () => {
    const markup = renderToStaticMarkup(
      <ProgressHub
        activeFolder={null}
        summaries={{
          weight: { primary: '83,8 kg', secondary: '-8 kg totalt' },
        }}
        onBack={() => {}}
        onOpen={() => {}}
      />,
    )

    expect(markup).toContain('Framstegscenter')
    expect(markup).toContain('<h1>Framsteg</h1>')
    expect(markup).toContain('83,8 kg')
    expect(markup).toContain('progress-hub-folders')
    expect(markup).not.toContain('Tillbaka')
    expect(markup).toContain('Rapporter')
    expect(markup).toContain('insikter')
  })

  it('shows a back control inside an opened folder', () => {
    const markup = renderToStaticMarkup(
      <ProgressHub activeFolder="body-scan" onBack={() => {}} onOpen={() => {}}>
        <p>Scanvy</p>
      </ProgressHub>,
    )

    expect(markup).toContain('Tillbaka')
    expect(markup).toContain('Kroppsscanning')
    expect(markup).toContain('Scanvy')
    expect(markup).not.toContain('progress-hub-folders')
  })

  it('maps deep links to the matching folder', () => {
    expect(progressHubTargetFolders['body-analysis']).toBe('body-scan')
    expect(progressHubTargetFolders.vikt).toBe('weight')
    expect(progressHubTargetFolders.framstegsbilder).toBe('photos')
    expect(progressHubTargetFolders.rapportcenter).toBe('reports')
  })
})
