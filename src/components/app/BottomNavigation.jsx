import { appSections, normalizeAppSectionId } from '../../services/navigation/appSections.js'
import { useTranslation } from 'react-i18next'

function BottomNavigation({
  activeSection = 'home',
  onSectionChange,
}) {
  const { t } = useTranslation('navigation')
  const normalizedActiveSection = normalizeAppSectionId(activeSection)

  function handleNavigation(event, sectionId) {
    if (!onSectionChange) {
      return
    }

    event.preventDefault()
    onSectionChange(sectionId)
  }

  return (
    <nav className="bottom-nav" aria-label={t('mainNavigation')}>
      {appSections.map((section) => {
        const isActive = section.id === normalizedActiveSection

        return (
          <a
            aria-current={isActive ? 'page' : undefined}
            aria-label={t(`sections.${section.id}.aria`)}
            className={isActive ? 'is-active' : ''}
            href={`#app-section-${section.id}`}
            key={section.id}
            onClick={(event) => handleNavigation(event, section.id)}
          >
            <span aria-hidden="true">{section.icon}</span>
            <strong>{t(`sections.${section.id}.label`)}</strong>
          </a>
        )
      })}
    </nav>
  )
}

export default BottomNavigation
