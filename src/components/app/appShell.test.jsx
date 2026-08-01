import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AppLoadingScreen from './AppLoadingScreen.jsx'
import AppTopbar from './AppTopbar.jsx'
import BottomNavigation from './BottomNavigation.jsx'
import LazySectionFallback from './LazySectionFallback.jsx'
import OnboardingScreen from './OnboardingScreen.jsx'

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

  it('keeps bottom navigation anchors stable', () => {
    const markup = renderToStaticMarkup(<BottomNavigation />)

    expect(markup).toContain('href="#hem"')
    expect(markup).toContain('href="#vikt"')
    expect(markup).toContain('href="#installningar"')
    expect(markup).toContain('aria-label="Huvudnavigation"')
  })

  it('renders an accessible lazy fallback', () => {
    const markup = renderToStaticMarkup(<LazySectionFallback />)

    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('Laddar appsektioner')
  })
})
