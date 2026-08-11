import GlobalSearch from './GlobalSearch.jsx'

function formatNumber(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '–'
  }

  return new Intl.NumberFormat('sv-SE').format(Math.round(number))
}

function formatWeight(value) {
  const number = Number(String(value ?? '').replace(',', '.'))

  if (!Number.isFinite(number) || number <= 0) {
    return '–'
  }

  return `${number.toFixed(1).replace('.', ',')} kg`
}

function AppTopbar({
  authLoading,
  calorieGoal,
  caloriesToday,
  currentWeight,
  email,
  goalWeight,
  healthScore,
  onEditProfile,
  onSearchNavigate,
  onSignOut,
  profile,
  profileSummaryParts,
  proteinGoal,
  proteinToday,
  steps,
}) {
  const displayName = profile?.name?.trim()

  return (
    <header className="topbar home-topbar" id="hem">
      <div className="home-topbar-intro">
        <p className="eyebrow">Din översikt</p>

        <h1>{displayName ? `Hej ${displayName} 👋` : 'Hej! 👋'}</h1>

        {profileSummaryParts?.length > 0 && (
          <p className="profile-summary">
            {profileSummaryParts.join(' · ')}
          </p>
        )}

        <div className="topbar-health-stats" aria-label="Din hälsöversikt">
          <div className="topbar-health-stat topbar-health-stat-primary">
            <span>Health Score</span>
            <strong>
              {Number.isFinite(Number(healthScore))
                ? `${Math.round(Number(healthScore))}/100`
                : '–'}
            </strong>
          </div>

          <div className="topbar-health-stat">
            <span>Aktuell vikt</span>
            <strong>{formatWeight(currentWeight)}</strong>
          </div>

          <div className="topbar-health-stat">
            <span>Målvikt</span>
            <strong>{formatWeight(goalWeight)}</strong>
          </div>

          <div className="topbar-health-stat">
            <span>Steg idag</span>
            <strong>{formatNumber(steps)}</strong>
          </div>

          <div className="topbar-health-stat">
            <span>Kalorier idag</span>
            <strong>
              {Number.isFinite(Number(caloriesToday))
                ? `${formatNumber(caloriesToday)} kcal`
                : '–'}
            </strong>

            {Number.isFinite(Number(calorieGoal)) && (
              <small>mål {formatNumber(calorieGoal)} kcal</small>
            )}
          </div>

          <div className="topbar-health-stat">
            <span>Protein idag</span>
            <strong>
              {Number.isFinite(Number(proteinToday))
                ? `${formatNumber(proteinToday)} g`
                : '–'}
            </strong>

            {Number.isFinite(Number(proteinGoal)) && (
              <small>mål {formatNumber(proteinGoal)} g</small>
            )}
          </div>
        </div>
      </div>

      <div className="topbar-actions">
        <p className="welcome-note">
          Inloggad som {email || 'okänd e-post'}
        </p>

        <div className="topbar-button-row">
          <GlobalSearch onNavigate={onSearchNavigate} />

          <button
            className="secondary-button"
            type="button"
            onClick={onEditProfile}
          >
            Ändra profil
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={onSignOut}
            disabled={authLoading}
          >
            {authLoading ? 'Loggar ut…' : 'Logga ut'}
          </button>
        </div>

        <p className="disclaimer compact-disclaimer">
          Viktkollen ger allmänt stöd och ersätter inte medicinsk rådgivning.
        </p>
      </div>
    </header>
  )
}

export default AppTopbar
