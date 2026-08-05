import { appSections, normalizeAppSectionId } from '../../services/navigation/appSections.js'

function BottomNavigation({
  activeSection = 'home',
  onSectionChange,
}) {
  const normalizedActiveSection = normalizeAppSectionId(activeSection)

  function handleNavigation(event, sectionId) {
    if (!onSectionChange) {
      return
    }

    event.preventDefault()
    onSectionChange(sectionId)
  }

  return (
    <nav className="bottom-nav" aria-label="Huvudnavigation">
      {appSections.map((section) => {
        const isActive = section.id === normalizedActiveSection

        return (
          <a
            aria-current={isActive ? 'page' : undefined}
            aria-label={section.ariaLabel}
            className={isActive ? 'is-active' : ''}
            href={`#app-section-${section.id}`}
            key={section.id}
            onClick={(event) => handleNavigation(event, section.id)}
          >
            <span aria-hidden="true">{section.icon}</span>
            <strong>{section.label}</strong>
          </a>
        )
      })}
    </nav>
  )
}

export default BottomNavigation
