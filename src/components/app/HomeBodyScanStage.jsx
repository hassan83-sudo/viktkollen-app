import { lazy, Suspense, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import useOverviewStageLock from './useOverviewStageLock.js'
import { setBodyScanSessionActive } from '../../services/bodyScanSessionChrome.js'

const BodyAnalysisCard = lazy(() => import('../BodyAnalysisCard.jsx'))

/**
 * Opens the real Body Scan component directly from Home, without routing
 * through the Mer hub and without any intermediate "Ta tre bilder" or
 * hub-title/mode-switch screen in front of it. BodyAnalysisCard with
 * hideChrome renders nothing but the guided 5-step capture flow itself -
 * the same component, state and storage Mer -> Framsteg uses.
 */
function HomeBodyScanStage({ onClose, profile, userId, weights }) {
  const { t } = useTranslation(['common'])
  useOverviewStageLock(onClose)

  // Hide the bottom nav for the whole overlay lifetime via the shared
  // display:none session class - not just a higher z-index, which leaves the
  // nav focusable/tappable underneath. Always restored on close/unmount.
  useEffect(() => {
    setBodyScanSessionActive(true)
    return () => setBodyScanSessionActive(false)
  }, [])

  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay) return null

  return createPortal(
    <div className="overview-home-stage is-body-scan is-fullscreen-flow" role="dialog" aria-label={t('common:actions.close')} aria-modal="true">
      <div className="home-body-scan-capture">
        <Suspense fallback={<p className="progress-hub-loading">{t('common:loading', { defaultValue: 'Laddar...' })}</p>}>
          <BodyAnalysisCard hideChrome onClose={onClose} profile={profile} userId={userId} weights={weights} />
        </Suspense>
      </div>
    </div>,
    overlay,
  )
}

export default HomeBodyScanStage
