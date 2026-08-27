import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HomeSocialPreview from './HomeSocialPreview.jsx'

describe('HomeSocialPreview', () => {
  it('renders nothing when the social UI feature is off', () => {
    const html = renderToStaticMarkup(
      <HomeSocialPreview enabled={false} isAuthenticated conversations={[{ conversationId: 'x' }]} />,
    )
    expect(html).toBe('')
  })

  it('shows a real empty state instead of fake friends', () => {
    const html = renderToStaticMarkup(
      <HomeSocialPreview enabled isAuthenticated liveEnabled conversations={[]} onAddFriend={() => {}} onOpenChat={() => {}} />,
    )
    expect(html).toContain('Vänner')
    expect(html).toContain('Träna och håll kontakten tillsammans.')
    expect(html).toContain('Lägg till vän')
    expect(html).not.toContain('Anna')
    expect(html).not.toContain('Ska vi träna')
  })

  it('shows setup status without live backend data', () => {
    const html = renderToStaticMarkup(
      <HomeSocialPreview enabled isAuthenticated conversations={[]} onAddFriend={() => {}} onOpenChat={() => {}} />,
    )

    expect(html).toContain('Chatten är inte ansluten ännu. Ingen fejkdata visas.')
    expect(html).toContain('Lägg till vän')
    expect(html).toContain('Öppna chatten')
  })
})
