import { useMemo, useState } from 'react'

const COPY = {
  inkasso: {
    eyebrow: 'Ekonomi · Inkasso',
    title: 'Inkasso',
    intro: 'Samla inkassokrav, förfallodatum och betalningar på ett ställe.',
    partyLabel: 'Inkassobolag / företag',
    itemLabel: 'Krav',
  },
  kronofogden: {
    eyebrow: 'Ekonomi · Kronofogden',
    title: 'Kronofogden',
    intro: 'Håll egen översikt över ärenden, skulder, deadlines och betalningar.',
    partyLabel: 'Fordringsägare / ärende',
    itemLabel: 'Ärende',
  },
}

function storageKey(type) {
  return `viktkollen:${type}:cases:v1`
}

function readCases(type) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(type)) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function DebtCaseSection({ type = 'inkasso' }) {
  const copy = COPY[type] || COPY.inkasso
  const [cases, setCases] = useState(() => readCases(type))
  const [form, setForm] = useState({ party: '', amount: '', deadline: '', monthlyPayment: '', priority: 'medium' })

  const openCases = cases.filter((item) => !item.paid)
  const totalOpen = useMemo(
    () => openCases.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [openCases],
  )

  function save(next) {
    setCases(next)
    localStorage.setItem(storageKey(type), JSON.stringify(next))
  }

  function addCase(event) {
    event.preventDefault()
    const party = form.party.trim()
    const amount = Number(form.amount)
    if (!party || !Number.isFinite(amount) || amount <= 0) return

    save([
      ...cases,
      {
        id: crypto.randomUUID?.() || `${Date.now()}`,
        party,
        amount,
        deadline: form.deadline,
        monthlyPayment: Number(form.monthlyPayment || 0),
        priority: form.priority,
        paid: false,
        requestedMoreTime: false,
      },
    ])
    setForm({ party: '', amount: '', deadline: '', monthlyPayment: '', priority: 'medium' })
  }

  function updateCase(id, patch) {
    save(cases.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  function removeCase(id) {
    save(cases.filter((item) => item.id !== id))
  }

  return (
    <div id={type} className="debt-case-section">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{copy.title}</h2>
          </div>
        </div>
        <p>{copy.intro}</p>
        <div className="app-information">
          <strong>{totalOpen.toLocaleString('sv-SE')} kr</strong>
          <p>Totalt kvar · {openCases.length} öppna {openCases.length === 1 ? copy.itemLabel.toLocaleLowerCase('sv-SE') : 'poster'}</p>
        </div>
      </article>

      <article className="panel">
        <h3>Lägg till {copy.itemLabel.toLocaleLowerCase('sv-SE')}</h3>
        <form className="form-grid" onSubmit={addCase}>
          <label>
            {copy.partyLabel}
            <input value={form.party} onChange={(event) => setForm({ ...form, party: event.target.value })} required />
          </label>
          <label>
            Belopp
            <input type="number" min="1" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
          </label>
          <label>
            Förfallodatum / deadline
            <input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
          </label>
          <label>
            Månadsbetalning
            <input type="number" min="0" inputMode="decimal" value={form.monthlyPayment} onChange={(event) => setForm({ ...form, monthlyPayment: event.target.value })} />
          </label>
          <label>
            Prioritet
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              <option value="high">Hög</option>
              <option value="medium">Normal</option>
              <option value="low">Låg</option>
            </select>
          </label>
          <button className="primary-button" type="submit">Lägg till</button>
        </form>
      </article>

      <article className="panel">
        <h3>Mina {type === 'inkasso' ? 'krav' : 'ärenden'}</h3>
        {cases.length === 0 && <p>Inga poster tillagda ännu.</p>}
        {cases.map((item) => (
          <div className="app-information" key={item.id}>
            <div className="panel-heading">
              <div>
                <strong>{item.party}</strong>
                <p>{Number(item.amount).toLocaleString('sv-SE')} kr{item.deadline ? ` · ${item.deadline}` : ''}</p>
              </div>
              <span>{item.paid ? '✓ Betald' : item.priority === 'high' ? 'Hög prioritet' : 'Öppen'}</span>
            </div>
            {item.monthlyPayment > 0 && <p>Månadsbetalning: {Number(item.monthlyPayment).toLocaleString('sv-SE')} kr</p>}
            {item.requestedMoreTime && <p>Begäran om mer tid markerad.</p>}
            <div className="button-row">
              {!item.paid && (
                <button className="secondary-button" type="button" onClick={() => updateCase(item.id, { paid: true })}>Markera betald</button>
              )}
              {!item.paid && !item.requestedMoreTime && (
                <button className="secondary-button" type="button" onClick={() => updateCase(item.id, { requestedMoreTime: true })}>Begär mer tid</button>
              )}
              <button className="secondary-button" type="button" onClick={() => removeCase(item.id)}>Ta bort</button>
            </div>
          </div>
        ))}
      </article>

      <article className="panel">
        <p className="muted-copy">Detta är din egen översikt i Viktkollen och är inte en koppling till ett inkassobolag, Kronofogden eller en myndighet.</p>
      </article>
    </div>
  )
}

export default DebtCaseSection
