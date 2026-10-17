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
      <style>{`
        .bottom-nav { display: grid !important; grid-template-columns: repeat(var(--bottom-nav-count), minmax(0, 1fr)) !important; }
        .bottom-nav > a { min-width: 0 !important; width: 100% !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 4px !important; padding: 8px 2px !important; text-align: center !important; overflow: hidden; }
        .bottom-nav > a > span { display: flex; align-items: center; justify-content: center; height: 24px; font-size: 21px; line-height: 1; }
        .bottom-nav > a > strong { display: block !important; position: static !important; max-width: 100%; font-size: clamp(8px, 2.2vw, 11px) !important; line-height: 1.15 !important; white-space: nowrap !important; overflow: hidden; }
        .bottom-nav .support-headset { width: 24px; height: 24px; color: #36e4df; }
      `}</style>
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
            <span aria-hidden="true">{section.id === 'support' ? (
              <svg className="support-headset" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 13v-2a8 8 0 0 1 16 0v2" />
                <rect x="2.5" y="12" width="4" height="7" rx="2" />
                <rect x="17.5" y="12" width="4" height="7" rx="2" />
                <path d="M19.5 19c0 2-2.5 3-5.5 3h-2" />
                <rect x="10" y="20.5" width="4" height="2" rx="1" />
              </svg>
            ) : section.icon}</span>
            <strong>{t(`sections.${section.id}.label`)}</strong>
          </a>
        )
      })}
    </nav>
  )
}

export default BottomNavigation
