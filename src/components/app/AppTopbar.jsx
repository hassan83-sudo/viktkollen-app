function AppTopbar({
  authLoading,
  email,
  onEditProfile,
  onSignOut,
  profile,
  profileSummaryParts,
}) {
  return (
    <header className="topbar" id="hem">
      <div>
        <p className="eyebrow">Viktkollen MVP</p>
        <h1>
          {profile?.name ? `Hej ${profile.name}` : 'Coach för träning, mat och vanor'}
        </h1>
        <p className="profile-summary">
          {profileSummaryParts.join(' · ')}
        </p>
      </div>
      <div className="topbar-actions">
        <p className="welcome-note">
          Inloggad som {email || 'okänd e-post'}
        </p>
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
          Logga ut
        </button>
        <p className="disclaimer">
          Den här appen ger endast allmänt stöd för hälsa och välmående. Den är
          inte medicinsk rådgivning, diagnos eller behandling.
        </p>
      </div>
    </header>
  )
}

export default AppTopbar
