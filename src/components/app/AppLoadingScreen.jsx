import PwaExperience from '../PwaExperience.jsx'

function AppLoadingScreen() {
  return (
    <main className="app-shell welcome-shell">
      <PwaExperience />
      <section className="welcome-card">
        <p className="eyebrow">Viktkollen Auth</p>
        <h1>Kontrollerar inloggning</h1>
        <p className="welcome-subtitle">
          Väntar på Supabase-session...
        </p>
      </section>
    </main>
  )
}

export default AppLoadingScreen
