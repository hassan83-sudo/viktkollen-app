const navigationItems = [
  ['#hem', 'Gå till översikt', '⌂', 'Hem'],
  ['#checkin', 'Gå till dagens check-in', '✓', 'Check'],
  ['#vikt', 'Gå till viktloggen', '↗', 'Vikt'],
  ['#mat', 'Gå till matchecklistan', '+', 'Mat'],
  ['#framstegsbilder', 'Gå till framstegsbilder', '□', 'Foto'],
  ['#manadsrapport', 'Gå till månadsrapport', '30', 'Rapport'],
  ['#installningar', 'Gå till inställningar', '⚙', 'Mer'],
]

function BottomNavigation() {
  return (
    <nav className="bottom-nav" aria-label="Huvudnavigation">
      {navigationItems.map(([href, ariaLabel, icon, label]) => (
        <a href={href} aria-label={ariaLabel} key={href}>
          <span>{icon}</span>
          <strong>{label}</strong>
        </a>
      ))}
    </nav>
  )
}

export default BottomNavigation
