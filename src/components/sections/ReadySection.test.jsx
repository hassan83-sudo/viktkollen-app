import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
const readySource = readFileSync(new URL('./ReadySection.jsx', import.meta.url), 'utf8')
const placeSource = readFileSync(new URL('./PlaceSection.jsx', import.meta.url), 'utf8')
const moreSource = readFileSync(new URL('./MoreSection.jsx', import.meta.url), 'utf8')
const navSource = readFileSync(new URL('../../services/navigation/appSections.js', import.meta.url), 'utf8')
const overviewSource = readFileSync(new URL('../app/OverviewDashboard.jsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')
const forgotCardSource = readFileSync(new URL('./ready/ForgotSomethingCard.jsx', import.meta.url), 'utf8')
const checklistCardSource = readFileSync(new URL('./ready/ReadyChecklistCard.jsx', import.meta.url), 'utf8')
const profileCardSource = readFileSync(new URL('./ready/ProfileCard.jsx', import.meta.url), 'utf8')
const eyeCardSource = readFileSync(new URL('./ready/AiEyeCard.jsx', import.meta.url), 'utf8')
const memoryCardSource = readFileSync(new URL('./ready/MemoryTrainingCard.jsx', import.meta.url), 'utf8')

describe('Ready! section wiring', () => {
  it('mounts Ready and Place as top-level sections', () => {
    expect(appSource).toContain("activeAppSection === 'redo'")
    expect(appSource).toContain('<ReadySection')
    expect(appSource).toContain("activeAppSection === 'place'")
    expect(appSource).toContain('<PlaceSection')
  })

  it('routes Home Body Scan and food scan entry points to the real components, not Ready', () => {
    expect(overviewSource).toContain('OverviewBodyScanStage')
    expect(overviewSource).toContain('HomeBodyScanStage')
    expect(overviewSource).not.toContain('OverviewFoodScanStage')
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
    expect(forgotCardSource).toContain("t('forgot.confirm'")
  })

  it('splits the mobile redesign into isolated Ready components instead of one monolithic file', () => {
    expect(readySource).toContain("import ReadyHeader from './ready/ReadyHeader.jsx'")
    expect(readySource).toContain("import ReadyChecklistCard from './ready/ReadyChecklistCard.jsx'")
    expect(readySource).toContain("import ForgotSomethingCard from './ready/ForgotSomethingCard.jsx'")
    expect(readySource).toContain("import AiCompanionCard from './ready/AiCompanionCard.jsx'")
    expect(readySource).toContain("import ReadyQuickActions from './ready/ReadyQuickActions.jsx'")
    expect(readySource).toContain("import NextCard from './ready/NextCard.jsx'")
    expect(readySource).toContain("import ReminderCard from './ready/ReminderCard.jsx'")
  })

  it('renders the new mobile card stack: header, checklist, forgot, companion teaser, quick actions, next/reminder', () => {
    expect(readySource).toContain('<ReadyHeader')
    expect(readySource).toContain('<ReadyChecklistCard')
    expect(readySource).toContain('<ForgotSomethingCard')
    expect(readySource).toContain('<AiCompanionCard onOpen={() => setShowCompanionProfile(true)}')
    expect(readySource).toContain('<ReadyQuickActions')
    expect(readySource).toContain('<NextCard')
    expect(readySource).toContain('<ReminderCard')
  })

  it('opens the AI companion profile as a separate modal instead of an inline grid, so it cannot stretch the main flow', () => {
    expect(readySource).not.toContain('ready-ai-grid')
    expect(readySource).toContain('ready-companion-modal')
    expect(readySource).toContain('showCompanionProfile')
    expect(readySource.indexOf('showCompanionProfile ?')).toBeLessThan(readySource.indexOf('<CompanionProfilePanel'))
  })

  it('keeps the three quick action tiles (Profil, AI Ögat, Minnesträning) as their own isolated components', () => {
    expect(profileCardSource).toContain('quickActions.profile.title')
    expect(eyeCardSource).toContain('quickActions.eye.title')
    expect(memoryCardSource).toContain('quickActions.memory.title')
    expect(readySource).toContain('onOpenProfile={() => setShowCompanionProfile(true)}')
    expect(readySource).toContain('onOpenEye={() => setShowEyeInfo(true)}')
    expect(readySource).toContain('onOpenMemory={() => setShowAllTechniques(true)}')
  })

  it('keeps existing Redo functionality: item CRUD, examples, forgot flow, companion settings, Nästa events, Påminnelser', () => {
    expect(readySource).toContain('handleAddItem')
    expect(readySource).toContain('handleConfirmForgot')
    expect(readySource).toContain('handleDeleteConfirmed')
    expect(readySource).toContain('onToggleDone')
    expect(readySource).toContain('CompanionProfilePanel')
    expect(readySource).toContain('surface="ready"')
    expect(readySource).toContain('nextEvents')
    expect(readySource).toContain("onNavigateSection?.('notices')")
    expect(checklistCardSource).toContain('showExamples')
    expect(checklistCardSource).toContain('onUseExample')
  })

  it('scopes the new mobile styling to Redo-specific class names, not bare global selectors', () => {
    expect(appCss).toMatch(/\.ready-companion-card\s*\{/)
    expect(appCss).toMatch(/\.ready-quick-actions\s*\{/)
    expect(appCss).toMatch(/\.ready-action-tile\s*\{/)
    expect(appCss).toMatch(/\.ready-bottom-row\s*\{/)
    expect(appCss).toMatch(/\.ready-info-tile\s*\{/)
  })

  it('keeps the Fortsätt button on one line by giving the forgot-card form its own grid columns', () => {
    expect(appCss).toContain("button[type='submit'] {\n  white-space: nowrap;")
  })
})
