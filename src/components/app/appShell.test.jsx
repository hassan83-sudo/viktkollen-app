import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AppLoadingScreen from './AppLoadingScreen.jsx'
import AppTopbar from './AppTopbar.jsx'
import BottomNavigation from './BottomNavigation.jsx'
import LazySectionFallback from './LazySectionFallback.jsx'
import OnboardingScreen from './OnboardingScreen.jsx'
import { resolveMoreFolderFromTarget } from '../../services/more/moreFolders.js'

describe('Performance Architecture app shell components', () => {
  it('renders the auth loading shell without pulling feature panels into App markup', () => {
    const markup = renderToStaticMarkup(<AppLoadingScreen />)

    expect(markup).toContain('Kontrollerar inloggning')
    expect(markup).toContain('Väntar på Supabase-session')
  })

  it('renders onboarding with the same profile fields', () => {
    const markup = renderToStaticMarkup(
      <OnboardingScreen
        activityOptions={['Låg', 'Medel', 'Hög']}
        goalOptions={['gå ner i vikt', 'hålla vikten']}
        onProfileFormChange={() => {}}
        onSubmit={() => {}}
        profileError="Kontrollera profilen."
        profileForm={{
          activityLevel: 'Medel',
          goal: 'gå ner i vikt',
          goalWeight: '',
          name: '',
          startWeight: '',
        }}
      />,
    )

    expect(markup).toContain('Skapa din profil')
    expect(markup).toContain('Startvikt')
    expect(markup).toContain('Målvikt')
    expect(markup).toContain('Kontrollera profilen.')
  })

  it('renders topbar actions and disclaimer', () => {
    const markup = renderToStaticMarkup(
      <AppTopbar
        authLoading={false}
        email="test@example.com"
        onEditProfile={() => {}}
        onSignOut={() => {}}
        profile={{ name: 'Hassan' }}
        profileSummaryParts={['90,1 kg', '12,1 kg kvar']}
      />,
    )

    expect(markup).toContain('Hej Hassan')
    expect(markup).toContain('test@example.com')
    expect(markup).toContain('Ändra profil')
    expect(markup).toContain('inte medicinsk rådgivning')
  })

  it('renders the approved main navigation with Social Room next to More', () => {
    const markup = renderToStaticMarkup(<BottomNavigation activeSection="coach" />)

    expect(markup).toContain('class="bottom-nav"')
    expect(markup).toContain('href="#app-section-home"')
    expect(markup).toContain('href="#app-section-redo"')
    expect(markup).toContain('href="#app-section-place"')
    expect(markup).toContain('href="#app-section-notices"')
    expect(markup).toContain('href="#app-section-social"')
    expect(markup).toContain('href="#app-section-more"')
    expect(markup).not.toContain('href="#app-section-coach"')
    expect(markup).not.toContain('href="#app-section-nutrition"')
    expect(markup).not.toContain('href="#app-section-progress"')
    expect(markup).toContain('aria-label="Huvudnavigation"')
    expect(markup).toContain('href="#app-section-more"><span aria-hidden="true">⚙</span><strong>Mer</strong>')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('Redo!')
    expect(markup).toContain('Plats')
    expect(markup).toContain('Stället')
  })

  it('keeps Coach, Mat and Framsteg reachable through More destinations', () => {
    expect(resolveMoreFolderFromTarget('app-section-coach')).toBe('ai-coach')
    expect(resolveMoreFolderFromTarget('app-section-nutrition')).toBe('mat')
    expect(resolveMoreFolderFromTarget('app-section-progress')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('app-section-wellbeing')).toBe('ma-bra')
    expect(resolveMoreFolderFromTarget('body-analysis')).toBe('mal-framsteg')
  })

  it('marks More active for secondary Coach, Mat, Framsteg and Må bra routes', () => {
    ;['coach', 'nutrition', 'progress', 'wellbeing'].forEach((activeSection) => {
      const markup = renderToStaticMarkup(<BottomNavigation activeSection={activeSection} />)

      expect(markup).toContain('href="#app-section-more"')
      expect(markup).toContain('href="#app-section-more"><span aria-hidden="true">⚙</span><strong>Mer</strong>')
      expect(markup).toContain('aria-current="page"')
    })
  })

  it('hides the Social Room destination when social UI is disabled', () => {
    const markup = renderToStaticMarkup(<BottomNavigation showSocial={false} />)

    expect(markup).not.toContain('href="#app-section-social"')
    expect(markup).toContain('--bottom-nav-count:5')
  })

  it('supports controlled navigation callbacks', () => {
    const onSectionChange = vi.fn()
    const markup = renderToStaticMarkup(
      <BottomNavigation
        activeSection="unknown"
        onSectionChange={onSectionChange}
      />,
    )

    expect(markup).toContain('href="#app-section-home"')
    expect(markup).toContain('aria-current="page"')
    expect(onSectionChange).not.toHaveBeenCalled()
  })

  it('renders an accessible lazy fallback', () => {
    const markup = renderToStaticMarkup(<LazySectionFallback />)

    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('Laddar appsektioner')
  })
})
