import { getSmartCameraHubModes } from '../smartCameraModes.js'

export default function SmartCameraHub({ flags, onSelectMode }) {
  const { primary, secondary } = getSmartCameraHubModes(flags)
  const carryLists = secondary.find((mode) => mode.id === 'carry-lists')
  const remainingSecondary = secondary.filter((mode) => mode.id !== 'carry-lists')

  return (
    <div className="smart-camera-hub">
      <header className="smart-camera-hub-header">
        <p className="eyebrow">Smart kamera</p>
        <h2>AI-ögon, minne och vardagsguide</h2>
        <p>Välj ett läge. Live-preview stannar på enheten tills du själv skickar något till AI.</p>
      </header>

      {carryLists && (
        <nav className="smart-camera-mode-grid" aria-label="Mina ta-med-listor">
          <button
            className="smart-camera-mode-chip"
            type="button"
            onClick={() => onSelectMode(carryLists.id)}
          >
            <span aria-hidden="true">{carryLists.icon}</span>
            <strong>{carryLists.label}</strong>
          </button>
        </nav>
      )}

      <nav className="smart-camera-mode-grid" aria-label="Smart kamera-lägen">
        {primary.map((mode) => (
          <button key={mode.id} className="smart-camera-mode-chip" type="button" onClick={() => onSelectMode(mode.id)}>
            <span aria-hidden="true">{mode.icon}</span>
            <strong>{mode.label}</strong>
          </button>
        ))}
      </nav>
      {remainingSecondary.length > 0 && (
        <>
          <h3 className="smart-camera-hub-more">Mer</h3>
          <nav className="smart-camera-mode-grid is-secondary" aria-label="Fler Smart kamera-lägen">
            {remainingSecondary.map((mode) => (
              <button key={mode.id} className="smart-camera-mode-chip" type="button" onClick={() => onSelectMode(mode.id)}>
                <span aria-hidden="true">{mode.icon}</span>
                <strong>{mode.label}</strong>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  )
}
