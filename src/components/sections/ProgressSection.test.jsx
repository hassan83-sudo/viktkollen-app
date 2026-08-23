import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('ProgressSection hub', () => {
  it('organizes Framsteg into folders instead of one long page', () => {
    const sectionSource = readFileSync(new URL('./ProgressSection.jsx', import.meta.url), 'utf8')
    const centerSource = readFileSync(new URL('../ProgressCenter.jsx', import.meta.url), 'utf8')
    const photosSource = readFileSync(new URL('../ProgressPhotos.jsx', import.meta.url), 'utf8')

    expect(sectionSource).toContain('ProgressHub')
    expect(sectionSource).toContain("activeFolder === 'weight'")
    expect(sectionSource).toContain("activeFolder === 'body-scan'")
    expect(sectionSource).toContain("activeFolder === 'photos'")
    expect(sectionSource).toContain("activeFolder === 'reports'")
    expect(sectionSource).toContain("activeFolder === 'tools'")
    expect(sectionSource).toContain('onBack={() => setActiveFolder(null)}')
    expect(sectionSource).toContain('<BodyAnalysisCard')
    expect(sectionSource).toContain('showBodyAnalysis={false}')
    expect(centerSource).toContain("view = 'all'")
    expect(centerSource).toContain("show('weight')")
    expect(centerSource).toContain("show('tools')")
    expect(photosSource).toContain('showBodyAnalysis = true')
  })
})
