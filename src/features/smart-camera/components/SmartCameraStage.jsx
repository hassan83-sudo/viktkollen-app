import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { getFeatureFlags, isFeatureEnabled } from '../../featureRegistry.js'
import { getSmartCameraMode } from '../smartCameraModes.js'
import SmartCameraHub from './SmartCameraHub.jsx'
import SmartCameraObjectBank from './SmartCameraObjectBank.jsx'
import SmartCameraChecklists from './SmartCameraChecklists.jsx'
import { getCurrentAiAuthorization, hasSameAiAuthUser } from '../../../services/ai/aiAuthTransport.js'
import { hasForgottenCameraAccess } from '../../../services/billing/forgottenAccess.js'
import SmartCameraModeViews from './SmartCameraModeViews.jsx'
import SmartCameraPrivacyCard from './SmartCameraPrivacyCard.jsx'

function PaidCameraTest({ children, onBack }) {
  const [access, setAccess] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    async function checkAccess() {
      try {
        const auth = await getCurrentAiAuthorization()
        if (!auth.ok) {
          if (!controller.signal.aborted) setAccess(auth.errorCode === 'AUTH_REQUIRED' ? 'denied' : 'unavailable')
          return
        }
        const response = await fetch('/api/billing/subscription', {
          headers: { Authorization: auth.authorizationHeader },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('subscription_unavailable')
        const { subscription } = await response.json()
        const sameUser = await hasSameAiAuthUser(auth.userScope)
        if (!controller.signal.aborted) setAccess(sameUser && hasForgottenCameraAccess(subscription) ? 'allowed' : 'denied')
      } catch {
        if (!controller.signal.aborted) setAccess('unavailable')
      }
    }
    checkAccess()
    return () => controller.abort()
  }, [])

  if (access === 'allowed') return children
  return (
    <section>
      <button type="button" className="secondary-button" onClick={onBack}>← Vardagshjälp</button>
      <h2>Har jag glömt något?</h2>
      <p role="status">{{
        loading: 'Kontrollerar ditt abonnemang …',
        denied: 'Kameratestet är tillgängligt med ett aktivt betalabonnemang.',
        unavailable: 'Abonnemanget kunde inte kontrolleras. Öppna testet igen om en stund.',
      }[access]}</p>
    </section>
  )
}

export default function SmartCameraStage({
  adapters = {},
  featureFlags,
  initialMode = '',
  isMicrophoneActive = false,
  onClose,
  onSurfaceChange,
  onVoiceCleanup,
  voiceBar = null,
}) {
  const flags = featureFlags || getFeatureFlags()
  const [modeId, setModeId] = useState(initialMode)
  const [cameraActive, setCameraActive] = useState(false)
  const mode = ['eyes', 'object-scan'].includes(modeId) ? null : getSmartCameraMode(modeId, flags)
  const backToHub = () => setModeId('')
  const modeView = mode && <SmartCameraModeViews adapters={adapters} mode={mode} voiceBar={voiceBar} onBack={backToHub} onCameraActive={setCameraActive} />

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    onSurfaceChange?.('smart-camera')

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (modeId) setModeId('')
        else onClose?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      onSurfaceChange?.('coach')
      onVoiceCleanup?.()
    }
  }, [modeId, onClose, onSurfaceChange, onVoiceCleanup])

  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay || !isFeatureEnabled('smartCamera', flags)) return null

  return createPortal(
    <div className="smart-camera-stage" role="dialog" aria-labelledby="smart-camera-title" aria-modal="true">
      <div className="smart-camera-stage-bar">
        <h1 id="smart-camera-title">Vardagshjälp</h1>
        <p className="smart-camera-hw-indicator" aria-live="polite">
          {cameraActive && <span className="is-camera">● Kamera aktiv</span>}
          {isMicrophoneActive && <span className="is-mic">● Mikrofon aktiv</span>}
        </p>
        <button className="overview-body-scan-close" type="button" onClick={onClose}>Stäng</button>
      </div>
      <div className="smart-camera-stage-body">
        {modeId === 'object-bank'
          ? <SmartCameraObjectBank onBack={() => setModeId('')} onOpenChecklists={() => setModeId('checklists-bank')} />
          : modeId === 'checklists-bank' || modeId === 'personal-care'
            ? <SmartCameraChecklists key={modeId} personalCare={modeId === 'personal-care'} onBack={backToHub} onOpenBank={() => setModeId('object-bank')} />
            : mode?.id === 'forgotten'
              ? <PaidCameraTest onBack={backToHub}>{modeView}</PaidCameraTest>
              : modeView || <SmartCameraHub flags={flags} onSelectMode={setModeId} />}
        <SmartCameraPrivacyCard
          aiReceivesFrame={false}
          audioToServer={mode?.id === 'ai-ear'}
          cameraActive={cameraActive}
          savedLabels={['Checklistor, rutiner och objektplatser sparas lokalt om du redigerar dem.']}
          voiceToAi={isMicrophoneActive || mode?.id === 'ask-ai'}
        />
      </div>
    </div>,
    overlay,
  )
}
