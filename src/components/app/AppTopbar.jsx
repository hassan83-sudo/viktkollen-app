function AppTopbar({
  authLoading,
  email,
  onEditProfile,
  onSignOut,
  profile,
  profileSummaryParts,
}) {
  const displayName = profile?.name?.trim()

  return (
    <header className="topbar home-topbar" id="hem">
      <div className="home-topbar-intro">
        <p className="eyebrow">Din översikt</p>

        <h1>
          {displayName
            ? `Hej ${displayName} 👋`
            : 'Hej! 👋'}
        </h1>

        {profileSummaryParts?.length > 0 && (
          <p className="profile-summary">
            {profileSummaryParts.join(' · ')}
          </p>
        )}
      </div>

      <div className="topbar-actions">
        <p className="welcome-note">
          Inloggad som {email || 'okänd e-post'}
        </p>

        <div className="topbar-button-row">
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