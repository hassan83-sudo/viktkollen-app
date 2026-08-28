import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MoreHub from './MoreHub.jsx'
import { moreHubFolders } from '../../services/more/moreFolders.js'

describe('MoreHub', () => {
  it('renders a short hub with sync status and seven folders', () => {
    const html = renderToStaticMarkup(
      <MoreHub
        isAuthenticated
        syncStatus={{ online: true, statusCode: 'synced', statusLabel: 'Synkad' }}
        onOpen={() => {}}
      />,
    )

    expect(html).toContain('Online')
    expect(html).toContain('Allt är synkat')
    expect(html).toContain('Kategorier')
    moreHubFolders.forEach((folder) => {
      expect(html).toContain(folder.title.replaceAll('&', '&amp;'))
      expect(html).toContain(folder.description)
    })
    expect(html).not.toContain('← Tillbaka')
  })

  it('opens a folder view with back navigation', () => {
    const html = renderToStaticMarkup(
      <MoreHub activeFolder="sakerhet-backup" onBack={() => {}}>
        <p>Backupinnehåll</p>
      </MoreHub>,
    )

    expect(html).toContain('← Tillbaka')
    expect(html).toContain('Säkerhet &amp; Backup')
    expect(html).toContain('Backupinnehåll')
    expect(html).not.toContain('Kategorier')
  })
})
