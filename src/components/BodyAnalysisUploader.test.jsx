import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import BodyAnalysisUploader from './BodyAnalysisUploader.jsx'

const completePhotos = {
  back: { name: 'back.jpg', preview: '/back.jpg' },
  front: { name: 'front.jpg', preview: '/front.jpg' },
  side: { name: 'side.jpg', preview: '/side.jpg' },
}

describe('BodyAnalysisUploader', () => {
  it('renders iPhone-safe file capture fallback for the active body scan step', () => {
    const html = renderToStaticMarkup(
      <BodyAnalysisUploader
        canAnalyze={false}
        currentAnalysisStatus="Väntar på tre vinklar"
        disabledReason=""
        photos={{}}
        onAnalyze={() => {}}
        onPhotoChange={() => {}}
      />,
    )

    expect(html).toContain('Steg 1 av 3')
    expect(html).toContain('class="secondary-button body-scan-file-picker"')
    expect(html).toContain('for="body-scan-file-front"')
    expect(html).toContain('id="body-scan-file-front"')
    expect(html).toContain('type="file"')
    expect(html).toContain('accept="image/*"')
    expect(html).toContain('capture="environment"')
    expect(html).toContain('iPhone kan fortfarande ta eller välja bild')
    expect(html).not.toContain('display: none')
  })

  it('marks all three body scan angles complete and enables analysis when photos exist', () => {
    const html = renderToStaticMarkup(
      <BodyAnalysisUploader
        canAnalyze
        currentAnalysisStatus="Redo att analysera"
        disabledReason=""
        photos={completePhotos}
        onAnalyze={() => {}}
        onPhotoChange={() => {}}
      />,
    )

    expect(html).toContain('3/3 klara')
    expect(html).toContain('front.jpg')
    expect(html).toContain('side.jpg')
    expect(html).toContain('back.jpg')
    expect(html).toContain('Analysera kroppen')
    expect(html).not.toContain('disabled=""')
  })
})
