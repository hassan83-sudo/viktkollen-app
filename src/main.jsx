import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/index.js'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import './dark-theme.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary area="root" title="Appen kunde inte visas">
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
