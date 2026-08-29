import { lazy, Suspense, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import useOverviewStageLock from './useOverviewStageLock.js'

const BodyAnalysisCard = lazy(() => import('../BodyAnalysisCard.jsx'))

/**
 * Opens the real Body Scan component directly from Home, without routing
 * through the Mer hub. A short consent screen comes first; the capture flow
 * itself (three photos, camera permission, history, analysis) is entirely
 * BodyAnalysisCard - the same component and storage Mer -> Framsteg uses.
 */
function HomeBodyScanStage({ onClose, profile, userId, weights }) {
  const { t } = useTranslation(['bodyScan', 'home', 'common'])
  const [started, setStarted] = useState(false)
  useOverviewStageLock(onClose)
  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay) return null

  return createPortal(
    <div className="overview-home-stage is-body-scan" role="dialog" aria-labelledby="home-body-scan-title" aria-modal="true">
      {!started ? (
        <div className="home-body-scan-intro">
          <button className="overview-body-scan-close" type="button" onClick={onClose}>
            {t('common:actions.close')}
          </button>
          <p className="eyebrow">{t('home:labels.bodyScan')}</p>
          <h2 id="home-body-scan-title">{t('bodyScan:card.heading.hubTitle')}</h2>
          <p className="progress-photo-safety">{t('bodyScan:card.privacy.localCamera')}</p>
          <p className="progress-photo-safety">{t('bodyScan:card.privacy.sendImages')}</p>
          <div className="overview-body-scan-actions">
            <button className="primary-button" type="button" onClick={() => setStarted(true)}>
              {t('bodyScan:card.heading.modePhoto')}
            </button>
            <button className="secondary-button" type="button" onClick={onClose}>
              {t('common:back')}
            </button>
          </div>
        </div>
      ) : (
        <div className="home-body-scan-capture">
          <button className="overview-body-scan-close" type="button" onClick={onClose}>
            {t('common:actions.close')}
          </button>
          <Suspense fallback={<p className="progress-hub-loading">{t('common:loading', { defaultValue: 'Laddar...' })}</p>}>
            <BodyAnalysisCard profile={profile} userId={userId} weights={weights} />
          </Suspense>
        </div>
      )}
    </div>,
    overlay,
  )
}

export default HomeBodyScanStage
