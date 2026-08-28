import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
const readySource = readFileSync(new URL('./ReadySection.jsx', import.meta.url), 'utf8')
const placeSource = readFileSync(new URL('./PlaceSection.jsx', import.meta.url), 'utf8')
const moreSource = readFileSync(new URL('./MoreSection.jsx', import.meta.url), 'utf8')
const navSource = readFileSync(new URL('../../services/navigation/appSections.js', import.meta.url), 'utf8')
const overviewSource = readFileSync(new URL('../app/OverviewDashboard.jsx', import.meta.url), 'utf8')

describe('Ready! section wiring', () => {
  it('mounts Ready and Place as top-level sections', () => {
    expect(appSource).toContain("activeAppSection === 'redo'")
    expect(appSource).toContain('<ReadySection')
    expect(appSource).toContain("activeAppSection === 'place'")
    expect(appSource).toContain('<PlaceSection')
  })

  it('keeps Body Scan and food scan entry points on Home unchanged in source contracts', () => {
    expect(overviewSource).toContain('OverviewBodyScanStage')
    expect(overviewSource).toContain('OverviewFoodScanStage')
    expect(readySource).not.toContain('BodyAnalysis')
    expect(readySource).not.toContain('NutritionScanner')
  })

  it('exposes AI Coach and Mat from Mer without duplicating overlay state', () => {
    expect(moreSource).toContain("activeFolder === 'ai-coach'")
    expect(moreSource).toContain("activeFolder === 'mat'")
    expect(moreSource).toContain('onOpenAiCoach')
    expect(appSource).toContain('onOpenAiCoach={() => setAiCoachOverlayOpen(true)}')
    expect(appSource).toContain('NutritionSectionComponent={NutritionSection}')
    expect(moreSource).toContain('CoachSectionComponent')
  })

  it('labels social as Stället while keeping the social route id', () => {
    expect(navSource).toContain("id: 'social'")
    expect(navSource).toContain("label: 'Stället'")
  })

  it('keeps Place honest without GPS claims', () => {
    expect(placeSource).toContain("t('consent.title')")
    expect(placeSource).toContain("t('limits.noGps')")
    expect(placeSource).toContain('getPlaceFeatureAvailability')
    expect(placeSource).not.toContain('geolocation')
    expect(placeSource).not.toContain('navigator.geolocation')
  })

  it('requires confirmation before adding forgot items', () => {
    expect(readySource).toContain('pendingForgotLabel')
    expect(readySource).toContain('handleConfirmForgot')
    expect(readySource).toContain("t('forgot.confirm'")
  })
})
