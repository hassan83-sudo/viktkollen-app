import { appSections, getBottomNavActiveSectionId } from '../../services/navigation/appSections.js'
import { useTranslation } from 'react-i18next'

function BottomNavigation({
  activeSection = 'home',
  onSectionChange,
  showNotices = true,
  showSocial = true,
}) {
  const { t } = useTranslation('navigation')
  const normalizedActiveSection = getBottomNavActiveSectionId(activeSection)
  const sections = appSections.filter((section) =>
    (section.id !== 'social' || showSocial) &&
    (section.id !== 'notices' || showNotices))

  function handleNavigation(event, sectionId) {
    if (!onSectionChange) {
      return
    }

    event.preventDefault()
    onSectionChange(sectionId)
  }

  return (
    <nav
      className="bottom-nav"
      aria-label={t('mainNavigation')}
      style={{ '--bottom-nav-count': sections.length }}
    >
      {sections.map((section) => {
        const isActive = section.id === normalizedActiveSection

        return (
          // A11Y-8G (WCAG 2.5.3): the name is the visible label (the icon is
          // aria-hidden), so voice control can use what is on screen.
          <a
            aria-current={isActive ? 'page' : undefined}
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
