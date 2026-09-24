import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/index.js'
import './features/place/familyMapDomEnhancer.js'
import './components/app/homeLiveClockEnhancer.js'
import './components/app/homeWindGustEnhancer.js'
import './features/account/passwordSettingsEnhancer.js'
import './features/social/ambientSoundEnhancer.js'
import './features/social/chatTranslationEnhancer.js'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import './dark-theme.css'
import './components/AiCoachOverlay.mobile.css'
import './components/ReadySection.mobile.css'
import './components/PlaceSection.mobile.css'
import './components/FamilyMap.mobile.css'
import './components/FamilyMap.live.css'
import './components/PlaceCheckin.mobile.css'
import './components/PlaceHistory.mobile.css'
import './components/PlaceBatterySaver.mobile.css'
import './features/social/SocialStage.mobile.css'
import './features/social/SocialRoom.mobile.css'
// A11Y-8B: global accessibility overrides, imported last so they apply on
// top of the base theme and component styles.
import './styles/accessibility.css'
import { installFocusVisibility } from './services/accessibilityFocusVisibility.js'

// A11Y-8I: keep keyboard focus visible above the fixed bottom navigation and
// inside horizontal chip rows (WCAG 2.4.11).
installFocusVisibility()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary area="root" title="Appen kunde inte visas">
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
