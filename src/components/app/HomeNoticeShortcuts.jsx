function HomeNoticeShortcuts({ onOpenNotices }) {
  const shortcuts = [
    { id: 'timer', label: 'Timer' },
    { id: 'alarm', label: 'Väckarklocka' },
    { id: 'reminder', label: 'Påminnelse' },
    { id: 'bathroom', label: 'Badrum' },
  ]

  return (
    <section className="overview-home-section home-notice-shortcuts" aria-label="Snabbknappar för Notis">
      <div className="notice-card">
        <div className="notice-actions">
          <h2>Snabbt</h2>
          <button type="button" onClick={() => onOpenNotices?.()}>Alla notiser</button>
        </div>
        <div className="notice-suggestions" aria-label="Viktiga snabbknappar">
          {shortcuts.map((shortcut) => (
            <button key={shortcut.id} type="button" onClick={() => onOpenNotices?.(shortcut.id)}>
              {shortcut.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HomeNoticeShortcuts
