import { lazy, Suspense, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import useOverviewStageLock from './useOverviewStageLock.js'
import { setBodyScanSessionActive } from '../../services/bodyScanSessionChrome.js'

const BodyAnalysisCard = lazy(() => import('../BodyAnalysisCard.jsx'))

/**
 * Opens the real Body Scan capture directly from Home, without the intro
 * screens or the Mer hub. Voice guide, timer, photos, analysis, quota and
 * consent stay inside BodyAnalysisCard.
 */
function HomeBodyScanStage({ onClose, profile, userId, weights }) {
  const { t } = useTranslation(['bodyScan', 'home', 'common'])
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
    <div className="overview-home-stage is-body-scan" role="dialog" aria-label={t('home:labels.bodyScan')} aria-modal="true">
      <div className="home-body-scan-capture">
        <button className="overview-body-scan-close" type="button" onClick={onClose}>
          {t('common:actions.close')}
        </button>
        <button className="secondary-button home-body-scan-back" type="button" onClick={onClose}>
          {t('common:back')}
        </button>
        <Suspense fallback={<p className="progress-hub-loading">{t('common:loading', { defaultValue: 'Laddar...' })}</p>}>
          <BodyAnalysisCard directCapture profile={profile} userId={userId} weights={weights} />
        </Suspense>
      </div>
    </div>,
    overlay,
  )
}

export default HomeBodyScanStage
