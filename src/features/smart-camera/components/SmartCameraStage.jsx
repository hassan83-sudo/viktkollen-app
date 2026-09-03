import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { getFeatureFlags, isFeatureEnabled } from '../../featureRegistry.js'
import { getSmartCameraMode } from '../smartCameraModes.js'
import SmartCameraHub from './SmartCameraHub.jsx'
import SmartCameraModeViews from './SmartCameraModeViews.jsx'
import SmartCameraPrivacyCard from './SmartCameraPrivacyCard.jsx'

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
  const mode = getSmartCameraMode(modeId, flags)

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
        <h1 id="smart-camera-title">Smart kamera</h1>
        <p className="smart-camera-hw-indicator" aria-live="polite">
          {cameraActive && <span className="is-camera">● Kamera aktiv</span>}
          {isMicrophoneActive && <span className="is-mic">● Mikrofon aktiv</span>}
        </p>
        <button className="overview-body-scan-close" type="button" onClick={onClose}>Stäng</button>
      </div>
      <div className="smart-camera-stage-body">
        {mode
          ? (
            <SmartCameraModeViews
              adapters={adapters}
              mode={mode}
              voiceBar={voiceBar}
              onBack={() => setModeId('')}
              onCameraActive={setCameraActive}
            />
          )
          : <SmartCameraHub flags={flags} onSelectMode={setModeId} />}
        <SmartCameraPrivacyCard
          aiReceivesFrame={false}
          cameraActive={cameraActive}
          savedLabels={['Checklistor, rutiner och objektplatser sparas lokalt om du redigerar dem.']}
          voiceToAi={isMicrophoneActive || mode?.id === 'ask-ai'}
        />
      </div>
    </div>,
    overlay,
  )
}
