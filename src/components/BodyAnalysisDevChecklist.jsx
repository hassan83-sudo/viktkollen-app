const checklistItems = [
  'Välj inga bilder',
  'Välj bara en bild',
  'Välj fel filtyp',
  'Välj för stor fil',
  'Skapa demoanalys',
  'Importera ogiltig JSON',
  'Radera analys',
  'Rensa historik',
]

function BodyAnalysisDevChecklist() {
  return (
    <div className="body-analysis-recommended-steps">
      <div>
        <p className="eyebrow">Development</p>
        <h3>Manuell testchecklista</h3>
      </div>
      <ul>
        {checklistItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default BodyAnalysisDevChecklist
