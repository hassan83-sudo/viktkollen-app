import { useRef } from 'react'
import BodyScanRings from './BodyScanRings.jsx'
import {
  AVATAR_CARDINAL_VIEWS,
  AVATAR_FRONT_SRC,
  AVATAR_SOURCE,
  USER_SCAN_MEDIA,
  getAvatarViewAvailability,
  rotateAvatarView,
} from '../../services/bodyAvatarModel.js'

function BodyAvatarViewer({
  compareMode = 'simulation',
  holdOriginal = false,
  onViewChange,
  selectedRegion = '',
  simulationActive = false,
  view = 'front',
}) {
  const pointerRef = useRef(null)
  const availability = getAvatarViewAvailability(view)
  const showingOriginal = compareMode === 'original' || holdOriginal

  function commitView(nextView) {
    onViewChange?.(nextView)
  }

  function onPointerDown(event) {
    pointerRef.current = { x: event.clientX, view }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
    if (!pointerRef.current) return
    const dx = event.clientX - pointerRef.current.x
    if (Math.abs(dx) < 48) return
    const next = rotateAvatarView(pointerRef.current.view, dx > 0 ? -1 : 1)
    pointerRef.current = { x: event.clientX, view: next }
    commitView(next)
  }

  function onPointerUp() {
    pointerRef.current = null
  }

  return (
    <div className="body-avatar-viewer">
      <div
        className="body-avatar-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`Hälsokropp, ${availability.label}`}
      >
        <img alt="Viktkollens hälsokropp" draggable={false} src={AVATAR_FRONT_SRC} />
        <BodyScanRings className="overview-body-scan-rings is-fullscreen" />
        <p className="body-avatar-viewer-hint">↔ Dra för att rotera</p>
      </div>

      <div className="body-avatar-view-switch" role="group" aria-label="Kroppsvy">
        {Object.entries(AVATAR_CARDINAL_VIEWS).map(([id, mappedView]) => (
          <button
            className={availability.view === mappedView ? 'is-active' : ''}
            key={id}
            type="button"
            onClick={() => commitView(mappedView)}
          >
            {id === 'front' ? 'Fram' : id === 'side' ? 'Sida' : 'Bak'}
          </button>
        ))}
      </div>

      {!availability.renderable && (
        <p className="overview-body-scan-note">{availability.waitingReason}</p>
      )}
      {simulationActive && !showingOriginal && (
        <p className="overview-body-scan-note">
          Simuleringsvärden är lokala. Nuvarande PNG kan inte morphas realistiskt.
        </p>
      )}
      {selectedRegion ? (
        <p className="overview-body-scan-note">Valt område: {selectedRegion}</p>
      ) : null}
      <span className="sr-only">{AVATAR_SOURCE.type}</span>
      <span className="sr-only">{USER_SCAN_MEDIA.type}</span>
    </div>
  )
}

export default BodyAvatarViewer
