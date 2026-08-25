import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SmartCameraHub from './SmartCameraHub.jsx'
import { getFeatureFlags } from '../../featureRegistry.js'

describe('SmartCameraHub', () => {
  it('renders compact modes and hides Family Safety', () => {
    const html = renderToStaticMarkup(
      <SmartCameraHub flags={getFeatureFlags()} onSelectMode={() => {}} />,
    )
    expect(html).toContain('Har jag glömt något?')
    expect(html).toContain('Kolla mig')
    expect(html).toContain('Vad har jag med mig?')
    expect(html).toContain('Göra mig klar')
    expect(html).toContain('Sista kollen')
    expect(html).toContain('Ögon')
    expect(html).toContain('Mun')
    expect(html).not.toContain('Family')
    expect(html).not.toContain('Walkie')
  })

  it('keeps Smart Camera usable without Eyes, Mouth or Memory', () => {
    const html = renderToStaticMarkup(
      <SmartCameraHub
        flags={getFeatureFlags({ eyes: false, memory: false, mouth: false })}
        onSelectMode={() => {}}
      />,
    )
    expect(html).toContain('Kolla mig')
    expect(html).toContain('Kroppsscanning')
    expect(html).toContain('Mat')
    expect(html).not.toContain('Ögon')
    expect(html).not.toContain('Mun')
    expect(html).not.toContain('Vad har jag med mig?')
    expect(html).not.toContain('Var lade jag den?')
  })
})
