import { getSmartCameraHubModes } from '../smartCameraModes.js'

const carryListsMode = {
  icon: '📝',
  id: 'carry-lists',
  label: 'Mina ta-med-listor',
}

function FeaturedArtwork({ type }) {
  const common = { width: 66, height: 66, viewBox: '0 0 100 100', style: { flexShrink: 0, overflow: 'visible' }, 'aria-hidden': true }
  if (type === 'forgotten' || type === 'recall') return (
    <svg {...common}>
      <defs><radialGradient id="brainPink"><stop stopColor="#ffd3f9"/><stop offset=".55" stopColor="#ff60d7"/><stop offset="1" stopColor="#b80072"/></radialGradient><filter id="brainGlow"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <ellipse cx="50" cy="51" rx="38" ry="37" fill="#fa31bc" opacity=".35" filter="url(#brainGlow)"/>
      <path d="M49 21C36 8 18 21 22 36 7 43 13 61 25 65c-3 16 14 24 26 13 11 12 27 3 26-11 14-9 14-25 2-33 2-18-19-24-30-13Z" fill="url(#brainPink)" stroke="#ff92df" strokeWidth="2"/>
      <path d="M50 21c-5 13 4 18-2 29-5 9 4 17 2 28M24 35c15-5 19 6 12 13-7 8-15 0-18 11M35 22c-4 14 10 16 8 27M68 24c-13 4-15 18-5 24 11 7 16-5 12-11M78 55c-14-7-24 5-16 14M29 66c11-12 22 1 12 10M54 57c9-8 18-2 15 7" fill="none" stroke="#a90070" strokeWidth="4" strokeLinecap="round"/>
      <path d="M45 79c-1 8 5 13 10 18l6-4-6-18" fill="#e82b9c" stroke="#a50074" strokeWidth="2"/>
    </svg>
  )
  if (type === 'check-me') return (
    <svg {...common}>
      <defs><linearGradient id="personPurple" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f5a5ff"/><stop offset=".5" stopColor="#9e50fa"/><stop offset="1" stopColor="#4220a6"/></linearGradient></defs>
      <ellipse cx="50" cy="28" rx="18" ry="21" fill="url(#personPurple)" stroke="#b876ff" strokeWidth="2"/>
      <path d="M36 55Q50 48 64 55C83 61 87 74 87 92H13C13 74 18 61 36 55Z" fill="url(#personPurple)" stroke="#b876ff" strokeWidth="2"/>
      <path d="M33 62c-7 9-8 19-8 30M67 62c7 9 8 19 8 30" fill="none" stroke="#d3a2ff" strokeWidth="3" opacity=".65"/>
    </svg>
  )
  if (type === 'outfit') return (
    <svg {...common}>
      <defs><linearGradient id="shirtGreen" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b5ff73"/><stop offset=".43" stopColor="#3aff41"/><stop offset="1" stopColor="#008c2b"/></linearGradient></defs>
      <path d="M29 14 40 8Q50 19 60 8l11 6 24 22-17 19-12-10v43H34V45L22 55 5 36Z" fill="url(#shirtGreen)" stroke="#7aff6d" strokeWidth="2.5" strokeLinejoin="round"/>
      <path d="M40 8q10 16 20 0M34 44v44M66 44v44" fill="none" stroke="#009e36" strokeWidth="3" opacity=".55"/>
      <path d="M9 36 24 50M91 36 76 50" stroke="#eaffab" strokeWidth="3" opacity=".5"/>
    </svg>
  )
  if (type === 'grooming') return (
    <svg {...common}>
      <defs><linearGradient id="hairOrange" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff09c"/><stop offset=".35" stopColor="#ff9a2d"/><stop offset=".7" stopColor="#e9590d"/><stop offset="1" stopColor="#8d290a"/></linearGradient></defs>
      <path d="M48 7C18 5 14 29 15 51 13 65 5 75 9 91c9 9 23 2 30-2 8 4 19 4 25 0 12 9 26 5 28-5-10-19-8-31-9-47C81 15 65 7 48 7Z" fill="url(#hairOrange)" stroke="#ffb457" strokeWidth="2"/>
      <path d="M37 30C24 42 35 57 31 75l-4 15M59 22c21 12 9 33 16 51l8 15M45 15C27 24 26 36 26 50M67 17C77 31 76 46 72 57" fill="none" stroke="#ffca6c" strokeWidth="5" strokeLinecap="round"/>
      <path d="M50 28C37 28 34 45 35 56l7 17h17l7-17C68 43 62 28 50 28Z" fill="#090b18"/>
      <path d="M40 20Q50 34 66 24" fill="none" stroke="#ffdf83" strokeWidth="4"/>
    </svg>
  )
  return null
}

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
    { id: 'carry-lists', icon: '📋', title: 'Checklistor', description: 'Ta bild på t.ex. kylskåp, skåp eller innehåll.', glow: '#ac7856' },
    { id: 'routines', icon: '📖', title: 'Rutiner', description: 'Skapa och följ rutiner med hjälp av AI.', glow: '#286eff' },
  ]
  const availableUtility = utilityCards.filter((card) => secondary.some((mode) => mode.id === card.id))
  const availableFeatured = featuredCards.filter((card) => primary.some((mode) => mode.id === card.id))
  const otherPrimary = primary.filter((mode) => !featuredCards.some((card) => card.id === mode.id) && mode.id !== 'ask-ai')
  const merModes = secondary.filter((mode) => !utilityCards.some((card) => card.id === mode.id) && mode.id !== 'recall')

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
          display: 'flex', alignItems: 'center', width: '100%', minHeight: 104, maxHeight: 110,
          position: 'relative', overflow: 'hidden', margin: '12px 0 20px',
          padding: '16px 16px', borderRadius: 18, textAlign: 'left',
          border: '1px solid rgba(116,91,255,.65)', color: '#fff',
          background: 'radial-gradient(ellipse at 80% 50%, #4d0fba 0%, #15165b 40%, #051332 80%), linear-gradient(115deg,#091333,#201064)',
          boxShadow: 'inset 0 0 28px rgba(50,100,255,.12)',
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 29, marginRight: 12, zIndex: 1 }}>✦</span>
        <span style={{ display: 'grid', gap: 3, position: 'relative', zIndex: 1, maxWidth: '54%' }}>
          <strong style={{ fontSize: 19, lineHeight: 1.15 }}>AI-ögon</strong>
          <span style={{ fontSize: 12, lineHeight: 1.4, color: '#c6d7ff' }}>Kolla mitt läge, få feedback och guide i realtid.</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 130 130" style={{ position: 'absolute', width: 112, height: 112, right: 24, top: '50%', transform: 'translateY(-50%)', filter: 'drop-shadow(0 0 12px #754cff)' }}>
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
                position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0, minHeight: 86,
                gap: 8, padding: '10px 9px', borderRadius: 16, color: '#fff', textAlign: 'left',
                border: `1px solid ${card.glow}55`,
                background: `radial-gradient(ellipse at 0% 100%, ${card.glow}44, transparent 64%), linear-gradient(125deg, #12102a, #07152b)`,
                cursor: 'pointer',
              }}
            >
              <FeaturedArtwork type={card.id} />
              <span style={{ display: 'grid', gap: 4, minWidth: 0, paddingRight: 4 }}>
                <strong style={{ fontSize: 12, lineHeight: 1.2 }}>{card.title}</strong>
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
          <FeaturedArtwork type="recall" />
          <span style={{ display: 'grid', gap: 4, flex: 1 }}>
            <strong style={{ fontSize: 14 }}>Minne</strong>
            <span style={{ color: '#d9c4df', fontSize: 11 }}>Kom ihåg och få personliga förslag.</span>
          </span>
          <span aria-hidden="true" style={{ borderRadius: '50%', background: '#4c116c', padding: '1px 10px', fontSize: 25 }}>›</span>
        </button>
      )}
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
      {otherPrimary.length > 0 && (
        <nav className="smart-camera-mode-grid" aria-label="Övriga Smart kamera-lägen">
          {otherPrimary.map((mode) => (
            <button key={mode.id} className="smart-camera-mode-chip" type="button" onClick={() => onSelectMode(mode.id)}>
              <span aria-hidden="true">{mode.icon}</span>
              <strong>{mode.label}</strong>
            </button>
          ))}
        </nav>
      )}
      {merModes.length > 0 && (
        <>
          <h3 className="smart-camera-hub-more">Övriga lägen</h3>
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
