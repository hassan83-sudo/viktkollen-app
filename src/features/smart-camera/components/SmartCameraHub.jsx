import { getSmartCameraHubModes } from '../smartCameraModes.js'

export default function SmartCameraHub({ flags, onSelectMode }) {
  const { primary, secondary } = getSmartCameraHubModes(flags)
  const featuredCards = [
    { id: 'forgotten', icon: '🧠', title: 'Har jag glömt något?', description: 'Kontrollera saker som nycklar, plånbok, mobil m.m.', glow: '#e831b3' },
    { id: 'check-me', icon: '👤', title: 'Kolla mig', description: 'Få snabb feedback på ditt utseende.', glow: '#7835e9' },
    { id: 'outfit', icon: '👕', title: 'Kläder & stil', description: 'Få tips och förslag utifrån din garderob.', glow: '#05b86d' },
    { id: 'grooming', icon: '💇', title: 'Hår & frisyr', description: 'Få tips, inspiration och stiltips.', glow: '#dd742a' },
  ]
  const utilityCards = [
    { id: 'pack', icon: '🧳', title: 'Packning', description: 'Skapa checklistor utifrån din resa.', glow: '#007bff' },
    { id: 'where', icon: '📦', title: 'Hem & saker', description: 'Identifiera objekt, få råd och inspiration.', glow: '#ae875e' },
    { id: 'checklists-bank', icon: '📋', title: 'Checklistor', description: 'Ta bild på t.ex. kylskåp, skåp eller innehåll.', glow: '#ac7856' },
    { id: 'routines', icon: '📖', title: 'Rutiner', description: 'Skapa och följ rutiner med hjälp av AI.', glow: '#286eff' },
  ]
  const availableUtility = utilityCards.filter((card) => card.id === 'checklists-bank' || secondary.some((mode) => mode.id === card.id))
  const availableFeatured = featuredCards.filter((card) => primary.some((mode) => mode.id === card.id))

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
      <section aria-label="Praktisk hjälp i vardagen" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 3px', color: '#fff', fontSize: 19 }}>Praktisk hjälp i vardagen</h3>
        <p style={{ margin: '0 0 12px', color: '#b5c9ed', fontSize: 13 }}>Få snabba svar och tips med kameran.</p>
        <nav aria-label="Vardagshjälp" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9 }}>
          {availableFeatured.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectMode(card.id)}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0, minHeight: 93,
                gap: 8, padding: '12px 9px', borderRadius: 16, color: '#fff', textAlign: 'left',
                border: `1px solid ${card.glow}55`,
                background: `radial-gradient(ellipse at 0% 100%, ${card.glow}44, transparent 64%), linear-gradient(125deg, #12102a, #07152b)`,
                cursor: 'pointer',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 36, lineHeight: 1, flexShrink: 0, filter: `drop-shadow(0 0 8px ${card.glow}99)` }}>{card.icon}</span>
              <span style={{ display: 'grid', gap: 4, minWidth: 0, paddingRight: 4 }}>
                <strong style={{ fontSize: 12, lineHeight: 1.15 }}>{card.title}</strong>
                <span style={{ fontSize: 10, lineHeight: 1.35, color: '#bed0ed' }}>{card.description}</span>
              </span>
              <span aria-hidden="true" style={{ position: 'absolute', right: 6, top: 7, borderRadius: '50%', background: '#24314b', width: 23, height: 23, display: 'grid', placeItems: 'center', fontSize: 20 }}>›</span>
            </button>
          ))}
        </nav>
      </section>
      <nav aria-label="Packning, hem, checklistor och rutiner" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9, marginBottom: 18 }}>
        {availableUtility.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectMode(card.id)}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0, minHeight: 93,
              gap: 8, padding: '12px 9px', borderRadius: 16, color: '#fff', textAlign: 'left',
              border: `1px solid ${card.glow}55`,
              background: `radial-gradient(ellipse at 0% 100%, ${card.glow}44, transparent 64%), linear-gradient(125deg, #12102a, #07152b)`,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 36, lineHeight: 1, flexShrink: 0, filter: `drop-shadow(0 0 8px ${card.glow}99)` }}>{card.icon}</span>
            <span style={{ display: 'grid', gap: 4, minWidth: 0, paddingRight: 4 }}>
              <strong style={{ fontSize: 12, lineHeight: 1.15 }}>{card.title}</strong>
              <span style={{ fontSize: 10, lineHeight: 1.35, color: '#bed0ed' }}>{card.description}</span>
            </span>
            <span aria-hidden="true" style={{ position: 'absolute', right: 6, top: 7, borderRadius: '50%', background: '#24314b', width: 23, height: 23, display: 'grid', placeItems: 'center', fontSize: 20 }}>›</span>
          </button>
        ))}
      </nav>
      {secondary.some((mode) => mode.id === 'recall') && (
        <button
          type="button"
          onClick={() => onSelectMode('recall')}
          style={{
            display: 'flex', alignItems: 'center', width: '100%', gap: 12, minHeight: 58,
            padding: '9px 14px', marginBottom: 15, borderRadius: 15, textAlign: 'left',
            color: '#fff', border: '1px solid rgba(217,48,215,.42)',
            background: 'linear-gradient(105deg, #49102e, #230d36 70%, #360b52)', cursor: 'pointer',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 37, filter: 'drop-shadow(0 0 8px #ff4dd3)' }}>🧠</span>
          <span style={{ display: 'grid', gap: 4, flex: 1 }}>
            <strong style={{ fontSize: 14 }}>Minne</strong>
            <span style={{ color: '#d9c4df', fontSize: 11 }}>Kom ihåg och få personliga förslag.</span>
          </span>
          <span aria-hidden="true" style={{ borderRadius: '50%', background: '#4c116c', padding: '1px 10px', fontSize: 25 }}>›</span>
        </button>
      )}
      <button type="button" onClick={() => onSelectMode('object-bank')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px', marginBottom: 18, borderRadius: 15, color: '#fff', border: '1px solid #365eac', background: 'linear-gradient(115deg,#102653,#08152e)', textAlign: 'left', cursor: 'pointer' }}><span aria-hidden="true" style={{ fontSize: 31 }}>🗂️</span><span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 15 }}>Föremålsbank</strong><small style={{ color: '#c2d1ef' }}>Sök, sortera och lägg till egna saker</small></span><span aria-hidden="true">›</span></button>\n      <button type="button" onClick={() => onSelectMode('object-scan')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px', marginBottom: 18, borderRadius: 15, color: '#fff', border: '1px solid #315b9e', background: 'linear-gradient(115deg,#102451,#08152e)', textAlign: 'left', cursor: 'pointer' }}><span aria-hidden="true" style={{ fontSize: 31 }}>📷</span><span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 15 }}>Identifiera föremål med AI</strong><small style={{ color: '#c2d1ef' }}>Ta en bild och godkänn förslag till banken</small></span><span aria-hidden="true">›</span></button>
      <h3 style={{ color: '#fff', fontSize: 16, margin: '0 0 3px' }}>Mer</h3>
      <p style={{ color: '#b6c5dd', fontSize: 12, margin: '0 0 10px' }}>Ytterligare funktioner och information.</p>
      <nav aria-label="Fråga AI och integritet" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9, marginBottom: 14 }}>
        <button type="button" onClick={() => onSelectMode('ask-ai')} style={{ display: 'flex', alignItems: 'center', position: 'relative', gap: 9, minWidth: 0, padding: '12px 9px', minHeight: 76, borderRadius: 14, border: '1px solid #20436d', color: '#fff', textAlign: 'left', background: 'linear-gradient(120deg,#10213b,#061327)', cursor: 'pointer' }}>
          <span aria-hidden="true" style={{ fontSize: 35, filter: 'drop-shadow(0 0 8px #ffc526)' }}>💡</span>
          <span style={{ display: 'grid', gap: 3, minWidth: 0 }}><strong style={{ fontSize: 12 }}>Fråga AI</strong><span style={{ fontSize: 10, color: '#b5c8e8' }}>Ställ frågor om vad kameran ser.</span></span>
          <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: 23 }}>›</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '12px 9px', minHeight: 76, borderRadius: 14, border: '1px solid #20436d', color: '#fff', background: 'linear-gradient(120deg,#10213b,#061327)' }}>
          <span aria-hidden="true" style={{ fontSize: 34 }}>🛡️</span>
          <span style={{ display: 'grid', gap: 3, minWidth: 0 }}><strong style={{ fontSize: 12 }}>Din integritet</strong><span style={{ fontSize: 10, color: '#b5c8e8' }}>Läs om hur kamerabilder och analyser hanteras.</span></span>
        </div>
      </nav>
    </div>
  )
}
