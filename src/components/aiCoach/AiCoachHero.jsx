import { useTranslation } from 'react-i18next'

function AiCoachHero() {
  const { t } = useTranslation(['coach'])

  return (
    <div className="ai-coach-overlay-hero">
      <img alt={t('coach:overlay.robotAlt')} src="/viktkollen-ai-coach-robot.png" />
      <p className="ai-coach-overlay-intro">{t('coach:overlay.intro')}</p>
      <p className="ai-coach-overlay-ai-label">{t('coach:overlay.aiLabel')}</p>
    </div>
  )
}

export default AiCoachHero
