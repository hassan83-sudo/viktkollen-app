import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import BodyAnalysisUploader from './BodyAnalysisUploader.jsx'

const photo = (name) => ({
  name,
  preview: `data:image/jpeg;base64,${name}`,
})

describe('BodyAnalysisUploader', () => {
  it('renders the guided three-angle flow and keeps analysis disabled until all views exist', () => {
    const markup = renderToStaticMarkup(
      <BodyAnalysisUploader
        canAnalyze={false}
        currentAnalysisStatus="Väntar på tre vinklar"
        disabledReason=""
        photos={{ front: photo('front.jpg'), side: null, back: null }}
        onAnalyze={() => {}}
        onPhotoChange={() => {}}
      />,
    )

    expect(markup).toContain('Steg 1 av 3')
    expect(markup).toContain('Framifrån')
    expect(markup).toContain('Från sidan')
    expect(markup).toContain('Bakifrån')
    expect(markup).toContain('✓ Fram klar')
    expect(markup).toContain('disabled=""')
  })

  it('renders retake controls and enables analysis when front, side and back photos exist', () => {
    const markup = renderToStaticMarkup(
      <BodyAnalysisUploader
        canAnalyze
        currentAnalysisStatus="Redo att analysera"
        disabledReason=""
        photos={{
          back: photo('back.jpg'),
          front: photo('front.jpg'),
          side: photo('side.jpg'),
        }}
        onAnalyze={() => {}}
        onPhotoChange={() => {}}
      />,
    )

    expect(markup).toContain('3/3 klara')
    expect(markup).toContain('Ta om')
    expect(markup).toContain('Starta AI-kroppsanalys med tre valda vinklar')
    expect(markup).not.toContain('disabled=""')
  })
})
