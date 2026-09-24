// A11Y-8F test fixture (loaded by the Vite dev server inside the browser, not
// shipped). The walkie-talkie only appears during an accepted family call,
// which needs a real family, a second device and the backend. The spec
// mocks the two Supabase tables for an accepted call and mounts the real
// PlaceVoiceCallPanel with this helper; the microphone is Chromium's fake
// device. No peer, audio backend or paid service is involved.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import PlaceVoiceCallPanel from '../../../src/components/place/PlaceVoiceCallPanel.jsx'

export function mountWalkie({ familyId, targetUserId, familyMembers }) {
  const host = document.createElement('div')
  host.id = 'walkie-host'
  host.style.cssText = 'position:fixed;inset:0;z-index:5000;overflow:auto;padding:16px;background:#07111f'
  document.body.appendChild(host)
  createRoot(host).render(createElement(PlaceVoiceCallPanel, { familyId, familyMembers, onClose() {}, open: true, targetUserId }))
}
