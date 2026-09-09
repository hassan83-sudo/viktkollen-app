import { useTranslation } from 'react-i18next'

function NextCard({ nextEvents, onOpen }) {
  const { t } = useTranslation(['ready'])
  const nextEvent = nextEvents[0]
  const subtitle = nextEvent
    ? `${nextEvent.timeLabel} · ${nextEvent.title}`
    : t('next.empty')

  return (
    <button className="ready-info-tile" type="button" onClick={onOpen}>
      <span className="ready-info-tile-icon" aria-hidden="true">📅</span>
      <span className="ready-info-tile-copy">
        <strong>{t('next.title')}</strong>
        <span>{subtitle}</span>
      </span>
    </button>
  )
}

export default NextCard
