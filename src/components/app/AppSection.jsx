function AppSection({
  activeSection,
  children,
  id,
  label,
}) {
  const isActive = activeSection === id

  return (
    <section
      aria-hidden={!isActive}
      aria-label={label}
      className={`app-section${isActive ? ' is-active' : ''}`}
      hidden={!isActive}
      id={`app-section-${id}`}
    >
      {children}
    </section>
  )
}

export default AppSection
