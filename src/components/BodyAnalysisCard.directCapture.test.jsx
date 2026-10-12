/** @vitest-environment jsdom */

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'

import BodyAnalysisCard from './BodyAnalysisCard.jsx'
import { changeAppLanguage } from '../i18n/index.js'

describe('BodyAnalysisCard direct capture', () => {
  beforeEach(async () => {
    await changeAppLanguage('sv')
  })

  it('skips the mode intro and keeps the guided scan plus privacy', () => {
    const html = renderToStaticMarkup(<BodyAnalysisCard directCapture />)

    expect(html).not.toContain('Första steget')
    expect(html).not.toContain('>Ta tre bilder<')
    expect(html).not.toContain('Guidad videoscanning (kommer snart)')
    expect(html).toContain('Starta kameran')
    expect(html).toContain('Röstguide på')
    expect(html).toContain('Livekameran körs lokalt')
    expect(html).not.toContain('>Öppna kamera<')
  })

  it('still shows the mode intro when opened from Framsteg', () => {
    const html = renderToStaticMarkup(<BodyAnalysisCard />)

    expect(html).toContain('Första steget')
    expect(html).toContain('>Ta tre bilder<')
    expect(html).toContain('Guidad videoscanning (kommer snart)')
  })
})
