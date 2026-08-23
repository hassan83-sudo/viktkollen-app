export const progressHubFolders = [
  {
    id: 'weight',
    title: 'Vikt',
    description: 'Logga, statistik och trend',
  },
  {
    id: 'body-scan',
    title: 'Kroppsscanning',
    description: 'Kamera, pose-guide och resultat',
  },
  {
    id: 'photos',
    title: 'Framstegsbilder',
    description: 'Historik, filter och före/efter',
  },
  {
    id: 'reports',
    title: 'Rapporter & insikter',
    description: 'Månadsrapport och AI-insikter',
  },
  {
    id: 'tools',
    title: 'Historik & verktyg',
    description: 'Filter, export och övriga verktyg',
  },
]

export const progressHubTargetFolders = {
  'body-analysis': 'body-scan',
  framsteg: 'reports',
  framstegsbilder: 'photos',
  'progress-insights': 'reports',
  'progress-tools': 'tools',
  rapportcenter: 'reports',
  vikt: 'weight',
}

function ProgressHub({ activeFolder, children, onBack, onOpen, summaries = {} }) {
  const folder = progressHubFolders.find((entry) => entry.id === activeFolder) || null

  if (folder) {
    return (
      <div className="progress-hub-view">
        <button className="progress-hub-back" type="button" onClick={onBack}>
          Tillbaka
        </button>
        <header className="progress-hub-view-heading">
          <p className="eyebrow">Framsteg</p>
          <h1>{folder.title}</h1>
        </header>
        {children}
      </div>
    )
  }

  return (
    <div className="progress-hub">
      <header className="progress-hub-heading">
        <p className="eyebrow">Framstegscenter</p>
        <h1>Framsteg</h1>
        <p>Öppna en mapp i stället för att scrolla igenom allt på en gång.</p>
      </header>
      <nav className="progress-hub-folders" aria-label="Framstegsmappar">
        {progressHubFolders.map((entry) => {
          const summary = summaries[entry.id] || {}
          return (
            <button
              className="progress-hub-folder"
              key={entry.id}
              type="button"
              onClick={() => onOpen(entry.id)}
            >
              <span>
                <strong>{entry.title}</strong>
                <small>{summary.primary || entry.description}</small>
                {summary.secondary ? <small>{summary.secondary}</small> : null}
              </span>
              <span aria-hidden="true">›</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default ProgressHub
