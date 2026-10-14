/** @vitest-environment jsdom */

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'

import BodyAnalysisCard from './BodyAnalysisCard.jsx'
import { changeAppLanguage } from '../i18n/index.js'
import { resetHomeBodyScanSession } from '../services/homeBodyScanSession.js'

describe('BodyAnalysisCard direct capture', () => {
  beforeEach(async () => {
    resetHomeBodyScanSession()
    await changeAppLanguage('sv')
  })

  it('opens the guided timer camera from Home and does not use the system camera', () => {
    const html = renderToStaticMarkup(<BodyAnalysisCard directCapture />)

    expect(html).not.toContain('Första steget')
    expect(html).not.toContain('>Ta tre bilder<')
    expect(html).not.toContain('Guidad videoscanning (kommer snart)')
    expect(html).not.toContain('capture="environment"')
    expect(html).not.toContain('Bakifrån')
    expect(html).toContain('Ta två bilder: framifrån och från sidan.')
    expect(html).toContain('den tar två stillbilder')
    expect(html).not.toContain('tre stillbilder')
    expect(html).not.toContain('tre bildfiler')
    expect(html).toContain('Starta kameran')
    expect(html).toContain('Välj timer för automatisk bild')
    expect(html).toContain('3 sek')
    expect(html).toContain('5 sek')
    expect(html).toContain('10 sek')
    expect(html).toContain('Livekameran körs lokalt')
    expect(html).not.toContain('getUserMedia')
  })

  it('still shows the mode intro when opened from Framsteg', () => {
    const html = renderToStaticMarkup(<BodyAnalysisCard />)

    expect(html).toContain('Första steget')
    expect(html).toContain('>Ta två bilder<')
    expect(html).toContain('Guidad videoscanning (kommer snart)')
  })
})
