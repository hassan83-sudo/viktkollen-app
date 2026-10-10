import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../../../index.css'
import '../../../App.css'
import { Blocked, PreviewShell } from './PreviewApp.jsx'
import { isPreviewTestAllowed } from './previewGuard.js'

/* global __VK_BODY_SCAN_PREVIEW__ */
const buildFlag = typeof __VK_BODY_SCAN_PREVIEW__ !== 'undefined' && __VK_BODY_SCAN_PREVIEW__ === true

const allowed = isPreviewTestAllowed({ buildFlag, hostname: window.location.hostname })

createRoot(document.getElementById('root')).render(
  <StrictMode>{allowed ? <PreviewShell /> : <Blocked />}</StrictMode>,
)

const style = document.createElement('style')
style.textContent = `
  body { margin: 0; background: #050914; color: #fff; }
  .body-scan-preview-shell { display: grid; gap: 12px; max-width: 560px; margin: 0 auto;
    padding: calc(14px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px)); }
  .body-scan-preview-shell h1 { margin: 0; font-size: 1.4rem; color: #fff; }
  .body-scan-preview-facts { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 0.86rem; opacity: 0.85; }
  .body-scan-preview-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .body-scan-preview-actions > button { flex: 1 1 150px; min-height: 48px; }
`
document.head.append(style)
