import { getSmartCameraHubModes } from '../smartCameraModes.js'

const carryListsMode = {
  icon: '📝',
  id: 'carry-lists',
  label: 'Mina ta-med-listor',
}

export default function SmartCameraHub({ flags, onSelectMode }) {
  const { primary, secondary } = getSmartCameraHubModes(flags)
  const merModes = [
    carryListsMode,
    ...secondary.filter((mode) => mode.id !== 'carry-lists'),
  ]

  return (
    <div className="smart-camera-hub">
      <header className="smart-camera-hub-header">
        <p className="eyebrow">Smart kamera</p>
        <h2>AI-ögon, minne och vardagsguide</h2>
        <p>Välj ett läge. Live-preview stannar på enheten tills du själv skickar något till AI.</p>
      </header>
      <button
        className="smart-camera-ai-eye-banner"
        type="button"
        onClick={() => onSelectMode('eyes')}
        style={{
          display: 'flex', alignItems: 'center', width: '100%', minHeight: 104,
          position: 'relative', overflow: 'hidden', margin: '12px 0 20px',
          padding: '16px 16px', borderRadius: 18, textAlign: 'left',
          border: '1px solid rgba(116,91,255,.65)', color: '#fff',
          background: 'radial-gradient(ellipse at 85% 65%, #4813a8 0%, #17104b 38%, #081127 77%)',
          boxShadow: 'inset 0 0 28px rgba(50,100,255,.12)',
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 29, marginRight: 12, zIndex: 1 }}>✦</span>
        <span style={{ display: 'grid', gap: 3, position: 'relative', zIndex: 1, maxWidth: '54%' }}>
          <strong style={{ fontSize: 19, lineHeight: 1.15 }}>AI-ögon</strong>
          <span style={{ fontSize: 12, lineHeight: 1.4, color: '#c6d7ff' }}>Kolla mitt läge, få feedback och guide i realtid.</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 130 130" style={{ position: 'absolute', width: 124, height: 124, right: 28, top: '50%', transform: 'translateY(-50%)', filter: 'drop-shadow(0 0 12px #754cff)' }}>
          <defs>
            <radialGradient id="smart-camera-lens-glass"><stop offset="0" stopColor="#020317"/><stop offset=".25" stopColor="#17105c"/><stop offset=".56" stopColor="#034fc3"/><stop offset=".78" stopColor="#2a0a75"/><stop offset="1" stopColor="#a647ff"/></radialGradient>
            <linearGradient id="smart-camera-lens-ring" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#ea36ff"/><stop offset=".48" stopColor="#4237ff"/><stop offset=".78" stopColor="#00baff"/><stop offset="1" stopColor="#f5a5ff"/></linearGradient>
          </defs>
          <circle cx="65" cy="65" r="58" fill="#090a2b" stroke="url(#smart-camera-lens-ring)" strokeWidth="9"/>
          <circle cx="65" cy="65" r="46" fill="url(#smart-camera-lens-glass)" stroke="#6e5bff" strokeWidth="3"/>
          <circle cx="65" cy="65" r="33" fill="none" stroke="#167cff" strokeWidth="5" opacity=".85"/>
          <circle cx="65" cy="65" r="23" fill="#04081f" stroke="#8a2cff" strokeWidth="5"/>
          <circle cx="55" cy="51" r="9" fill="#fff" opacity=".85"/>
          <circle cx="72" cy="76" r="4" fill="#1ee6ff" opacity=".75"/>
        </svg>
        <span aria-hidden="true" style={{ marginLeft: 'auto', position: 'relative', zIndex: 1, fontSize: 25, paddingLeft: 8 }}>›</span>
      </button>
      <nav className="smart-camera-mode-grid" aria-label="Smart kamera-lägen">
        {primary.map((mode) => (
          <button key={mode.id} className="smart-camera-mode-chip" type="button" onClick={() => onSelectMode(mode.id)}>
            <span aria-hidden="true">{mode.icon}</span>
            <strong>{mode.label}</strong>
          </button>
        ))}
      </nav>
      {merModes.length > 0 && (
        <>
          <h3 className="smart-camera-hub-more">Mer</h3>
          <nav className="smart-camera-mode-grid is-secondary" aria-label="Fler Smart kamera-lägen">
            {merModes.map((mode) => (
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
