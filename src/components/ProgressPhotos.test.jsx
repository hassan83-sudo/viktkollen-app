import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ProgressPhotos from './ProgressPhotos.jsx'

vi.mock('./BodyAnalysisCard.jsx', () => ({
  default: () => <div data-testid="body-analysis-card" />,
}))

vi.mock('../services/appStorageService.js', () => ({
  readStorage: () => null,
}))

const baseProps = {
  afterPhotoId: 'after',
  beforePhotoId: 'before',
  hasProgressPhotos: true,
  onAfterPhotoIdChange: () => {},
  onBeforePhotoIdChange: () => {},
  onDeleteProgressPhoto: () => {},
  onProgressPhotoChange: () => {},
  onProgressPhotoNoteChange: () => {},
  onUpdateProgressPhoto: () => {},
  progressPhotoComparison: null,
  progressPhotoComparisonImages: [],
  progressPhotoCountLabel: '2 sparade bilder',
  progressPhotoItems: [
    {
      alt: 'Förebild',
      createdAt: '2026-07-01T10:00:00.000Z',
      createdAtLabel: '1 juli 2026',
      id: 'before',
      image: 'data:image/png;base64,before',
      note: 'Start',
      viewLabel: 'Framifrån',
      weight: 91,
      weightLabel: '91 kg',
    },
    {
      alt: 'Efterbild',
      createdAt: '2026-08-01T10:00:00.000Z',
      createdAtLabel: '1 augusti 2026',
      id: 'after',
      image: 'data:image/png;base64,after',
      note: 'Ny',
      viewLabel: 'Framifrån',
      weight: 89.4,
      weightLabel: '89,4 kg',
    },
  ],
  progressPhotoNote: '',
  progressPhotoOptions: [
    { id: 'before', label: '1 juli 2026' },
    { id: 'after', label: '1 augusti 2026' },
  ],
}

describe('ProgressPhotos', () => {
  it('renders Progress Photos V2 comparison controls and insights', () => {
    const html = renderToStaticMarkup(<ProgressPhotos {...baseProps} />)

    expect(html).toContain('Progress Photos V2 före/efter')
    expect(html).toContain('Senaste 30 dagar')
    expect(html).toContain('Vald viktförändring')
    expect(html).toContain('-1,6 kg')
    expect(html).toContain('Jämförelseläge')
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })

  it('renders empty state when no progress photos or body analysis history exists', () => {
    const html = renderToStaticMarkup(
      <ProgressPhotos
        {...baseProps}
        hasProgressPhotos={false}
        progressPhotoItems={[]}
        progressPhotoOptions={[]}
      />,
    )

    expect(html).toContain('Ingen bildhistorik ännu')
  })
})
