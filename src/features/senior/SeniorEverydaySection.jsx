import { useState } from 'react'

const complaintTopics = ['Vädret', 'Priserna', 'Tekniken', 'Trafiken']

function SeniorEverydaySection({ onOpenEye }) {
  const [medicineName, setMedicineName] = useState('')
  const [medicineTime, setMedicineTime] = useState('08:00')
  const [medicines, setMedicines] = useState([])
  const [complaint, setComplaint] = useState('')
  // A11Y-8U (8T B-8T-N4): an empty or blank name is not saved, and the user
  // is told why, as in Redo (8Q): a visible message in a polite status
  // region, linked with aria-describedby, and aria-invalid until the name
  // changes. Focus stays where the form was submitted from.
  const [medicineError, setMedicineError] = useState('')

  function addMedicine(event) {
    event.preventDefault()
    const name = medicineName.trim()
    if (!name) {
      setMedicineError('Skriv namnet på medicinen innan du lägger till.')
      return
    }
    setMedicineError('')
    setMedicines((current) => [...current, { id: `${Date.now()}-${name}`, name, time: medicineTime, taken: false }])
    setMedicineName('')
  }

  function toggleMedicine(id) {
    setMedicines((current) => current.map((item) => item.id === id ? { ...item, taken: !item.taken } : item))
  }

  return (
    <div id="senior-65-plus" className="senior-everyday-section">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">65+ · Min vardag</p>
            <h2>Enklare vardag, minnen och lite nöje</h2>
          </div>
        </div>
        <p>Samla egna rutiner, medicinpåminnelser och sådant du tycker om på ett ställe.</p>
      </article>

      <article className="panel">
        <h3>👁 AI Öga – Hitta glömda saker</h3>
        <p>Starta kameran och låt AI Öga hjälpa dig kontrollera om glasögon, nycklar, plånbok eller andra viktiga saker finns med.</p>
        <button className="primary-button" type="button" onClick={onOpenEye}>
          Öppna AI Öga
        </button>
      </article>

      <article className="panel">
        <h3>💊 Medicin</h3>
        <p>Lägg in den tid du själv har fått eller valt för din medicin. Viktkollen bestämmer inte dos eller behandling.</p>
        <form onSubmit={addMedicine} className="form-grid">
          <label>
            Medicin
            <input
              aria-describedby={medicineError ? 'senior-medicine-error' : undefined}
              aria-invalid={medicineError ? true : undefined}
              value={medicineName}
              onChange={(event) => {
                if (medicineError) setMedicineError('')
                setMedicineName(event.target.value)
              }}
              placeholder="Namn"
            />
          </label>
          <label>
            Tid
            <input type="time" value={medicineTime} onChange={(event) => setMedicineTime(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">Lägg till</button>
        </form>
        <p className="form-feedback-error" id="senior-medicine-error" role="status">{medicineError}</p>
        {medicines.map((item) => (
          <button className="secondary-button" key={item.id} type="button" onClick={() => toggleMedicine(item.id)}>
            {item.taken ? '✓ Tagen' : '○ Inte markerad'} · {item.time} · {item.name}
          </button>
        ))}
      </article>

      <article className="panel">
        <h3>☀ Min dag</h3>
        <p>Promenad, kaffe med någon, korsord, trädgård, läsa, ringa familjen eller bara ta det lugnt.</p>
      </article>

      <article className="panel">
        <h3>📺 Förr i tiden</h3>
        <p>En plats för musik, TV-klipp, nyheter och minnen från ungefär 1950-, 60- och 70-talet.</p>
        <p className="muted-copy">Klipp lägger vi till från källor som får visas eller länkas.</p>
      </article>

      <article className="panel">
        <h3>🧩 Hjärngympa</h3>
        <p>Korsord, ordfrågor, gamla uttryck, musikfrågor och små minnesquiz kan samlas här.</p>
      </article>

      <article className="panel">
        <h3>😄 Dagens gnäll</h3>
        <p>Välj något att muttra lite över – med glimten i ögat.</p>
        <div className="button-row">
          {complaintTopics.map((topic) => (
            <button className="secondary-button" key={topic} type="button" onClick={() => setComplaint(topic)}>{topic}</button>
          ))}
        </div>
        {complaint && <p><strong>{complaint}:</strong> Jaha, det var tydligen bättre förr igen. Tur att man åtminstone får klaga lite.</p>}
      </article>
    </div>
  )
}

export default SeniorEverydaySection
