import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import '../../dark-theme.css'
import '../../i18n/index.js'
import { OutfitMode } from './components/SmartCameraModeViews.jsx'
import { installCameraStartGuard } from '../shared/camera/cameraStartGuard.js'

// Public local-only fixture surface: no login, fake session, App cloud effects or paid AI.
installCameraStartGuard()
createRoot(document.getElementById('root')).render(<StrictMode>
  <main className="smart-camera-mode" style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
    <h1>Garderob – offline-Preview</h1>
    <p>Endast lokal garderob och kamera. Inloggning, molnsynk, liveväder, betalningar och AI är avstängda.</p>
    <OutfitMode />
  </main>
</StrictMode>)
