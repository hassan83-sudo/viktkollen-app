import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import BodyAnalysisResult from './BodyAnalysisResult.jsx'

const savedAnalysis = {
  createdAt: '2026-08-12T10:00:00.000Z',
  result: {
    bodyFatEstimate: null,
    confidence: 'medium',
    dataQuality: 'medium',
    estimatedMeasurements: {
      chestCm: null,
      hipCm: null,
      shoulderWidthCm: null,
      waistCm: { confidence: 'medium', max: 94, min: 88 },
    },
    estimatedWeight: {
      basis: 'Tre vinklar och registrerad längd.',
      confidence: 'medium',
      maxKg: 82,
      midpointKg: 79,
      minKg: 76,
    },
    measuredWeight: {
      date: '2026-08-10',
      source: 'Våg',
      valueKg: 78,
    },
    progressSummary: 'Stabil visuell baslinje.',
    routineFeedback: 'Ta nästa analys med samma ljus.',
    scanInput: {
      angles: ['front', 'side', 'back'],
      imageCount: 3,
      requiredAngles: ['front', 'side', 'back'],
    },
    source: 'ai',
    summary: 'Klar',
  },
}

describe('BodyAnalysisResult', () => {
  it('renders measured weight separately from AI-estimated weight ranges', () => {
    const markup = renderToStaticMarkup(
      <BodyAnalysisResult
        activeBodyMarker={{ text: 'Midja följs över tid.' }}
        angleComparison={[]}
        bodyOverviewMarkers={[]}
        formatAnalysisDate={() => '12 aug. 2026'}
        getResultSections={() => []}
        getResultSourceLabel={() => 'AI-resultat'}
        onMarkerChange={vi.fn()}
        renderResultValue={() => null}
        savedAnalysis={savedAnalysis}
      />,
    )

    expect(markup).toContain('Senast registrerad vikt')
    expect(markup).toContain('78 kg')
    expect(markup).toContain('AI-uppskattad vikt')
    expect(markup).toContain('76-82 kg')
    expect(markup).toContain('Mittpunkt cirka 79 kg')
    expect(markup).toContain('Midja')
    expect(markup).toContain('88-94 cm')
    expect(markup).toContain('ersätter inte våg')
  })

  it('renders analysis text without crashing when photo previews are missing', () => {
    const markup = renderToStaticMarkup(
      <BodyAnalysisResult
        activeBodyMarker={{ text: 'Midja följs över tid.' }}
        angleComparison={[]}
        bodyOverviewMarkers={[]}
        formatAnalysisDate={() => '12 aug. 2026'}
        getResultSections={() => []}
        getResultSourceLabel={() => 'AI-resultat'}
        onMarkerChange={vi.fn()}
        renderResultValue={() => null}
        savedAnalysis={{
          ...savedAnalysis,
          backPhoto: { name: 'back.jpg' },
          frontPhoto: { name: 'front.jpg' },
          sidePhoto: { name: 'side.jpg' },
        }}
      />,
    )

    expect(markup).toContain('Stabil visuell baslinje')
    expect(markup).toContain('78 kg')
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('Före/efter per vinkel')
  })
})
