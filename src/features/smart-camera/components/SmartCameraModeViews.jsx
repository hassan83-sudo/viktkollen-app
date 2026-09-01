import { useEffect, useMemo, useRef, useState } from 'react'

import { eyesFeature } from '../../eyes/eyesFeature.js'
import {
  createChecklist,
  createItemLocation,
  defaultCarryItems,
  defaultTodoItems,
  findItemLocation,
  formatLocationAnswer,
  getDefaultRoutines,
  getMemoryContext,
  memoryContexts,
  memoryTrainingMethods,
} from '../../memory/memoryModel.js'
import { compareRecallAnswer, startRecallRound } from '../../memory/memoryRecall.js'
import { loadMemoryState, saveMemoryState } from '../../memory/memoryStore.js'
import { mouthFeature } from '../../mouth/mouthFeature.js'
import {
  checkMeCountdownStart,
  checkMeCountdownStepMs,
  checkMeObservationDisclaimer,
  checkMeVisionReady,
  getCheckMeStep,
  getNextCheckMeIndex,
} from '../checkMeGuide.js'
import { compareChecklistToVisibleItems } from '../itemVisibility.js'
import { getReadyPromptDisclaimer, lastCheckSteps } from '../lastCheckGuide.js'
import { buildOutfitWeatherFacts, outfitFeedbackDisclaimer, outfitVisionReady } from '../outfitAdvice.js'
import ForgottenItemsCheck from './ForgottenItemsCheck.jsx'
import SmartCameraLiveView from './SmartCameraLiveView.jsx'

function ModeHeader({ mode, onBack, title }) {
  return (
    <header className="smart-camera-mode-header">
      <button className="smart-camera-back" type="button" onClick={onBack}>Hubb</button>
      <div>
        <p className="eyebrow">{mode?.icon} {mode?.label}</p>
        <h2>{title || mode?.label}</h2>
      </div>
    </header>
  )
}

function ChecklistEditor({ list, onChange }) {
  const [draft, setDraft] = useState('')

  function toggleItem(itemId) {
    onChange({
      ...list,
      items: list.items.map((item) => item.id === itemId ? { ...item, done: !item.done } : item),
    })
  }

  function removeItem(itemId) {
    onChange({
      ...list,
      items: list.items.filter((item) => item.id !== itemId),
    })
  }

  function addItem() {
    const label = draft.trim()
    if (!label) return
    onChange({
      ...list,
      items: [...list.items, { done: false, id: `item-${Date.now()}`, label }],
    })
    setDraft('')
  }

  return (
    <div className="smart-camera-checklist">
      <label className="smart-camera-context">
        Sammanhang
        <select
          value={list.contextId || 'everyday'}
          onChange={(event) => onChange({ ...list, contextId: event.target.value, title: `${getMemoryContext(event.target.value).label} · ${list.kind === 'todo' ? 'Att göra' : 'Att ta med'}` })}
        >
          {memoryContexts.map((context) => (
            <option key={context.id} value={context.id}>{context.label}</option>
          ))}
        </select>
      </label>
      <ul>
        {list.items.map((item) => (
          <li key={item.id}>
            <label>
              <input checked={item.done} type="checkbox" onChange={() => toggleItem(item.id)} />
              <span>{item.label}</span>
            </label>
            <button type="button" onClick={() => removeItem(item.id)}>Ta bort</button>
          </li>
        ))}
      </ul>
      <div className="smart-camera-add-row">
        <input
          aria-label="Ny punkt"
          placeholder="Lägg till punkt"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="secondary-button" type="button" onClick={addItem}>Lägg till</button>
      </div>
    </div>
  )
}

function ItemsMode({ cameraActive, list, onCameraActive, onChange, usesCamera }) {
  const comparison = compareChecklistToVisibleItems(list.items)
  return (
    <>
      <SmartCameraLiveView enabled={usesCamera} onActiveChange={onCameraActive} />
      <p className="smart-camera-note">
        Jag identifierar inte föremål automatiskt ännu. Markera det du själv ser.
        Om något inte syns i bild betyder det inte att du har glömt det.
      </p>
      <ChecklistEditor list={list} onChange={onChange} />
      <section className="smart-camera-compare">
        <h3>Jag ser</h3>
        {comparison.seen.length
          ? comparison.seen.map((item) => <p key={item.id}>✓ {item.label}</p>)
          : <p>Inget markerat ännu.</p>}
        <h3>Kontrollera</h3>
        {comparison.check.map((item) => <p key={item.id}>? {item.message}</p>)}
      </section>
      {!cameraActive && usesCamera && <p className="smart-camera-note">Kameran är valfri. Du kan bocka av listan manuellt.</p>}
    </>
  )
}

function CheckMeMode({ onCameraActive }) {
  const [index, setIndex] = useState(0)
  const [countdown, setCountdown] = useState(null)
  const timerRef = useRef(0)
  const current = getCheckMeStep(index)

  useEffect(() => () => window.clearInterval(timerRef.current), [])

  function startCountdown() {
    window.clearInterval(timerRef.current)
    let value = checkMeCountdownStart
    setCountdown(value)
    timerRef.current = window.setInterval(() => {
      value -= 1
      if (value <= 0) {
        window.clearInterval(timerRef.current)
        setCountdown(null)
        setIndex((currentIndex) => {
          const next = getNextCheckMeIndex(currentIndex)
          return next === null ? currentIndex : next
        })
        return
      }
      setCountdown(value)
    }, checkMeCountdownStepMs)
  }

  return (
    <>
      <SmartCameraLiveView enabled onActiveChange={onCameraActive} />
      <p className="smart-camera-pose">{current.step.label}</p>
      <p>{current.step.prompt}</p>
      {countdown !== null && <p className="smart-camera-count">{countdown}</p>}
      <button
        className="primary-button"
        type="button"
        onClick={startCountdown}
      >
        Starta 3 → 2 → 1
      </button>
      {!checkMeVisionReady && <p className="smart-camera-note">{checkMeObservationDisclaimer}</p>}
    </>
  )
}

function OutfitMode({ onCameraActive, weather }) {
  const facts = useMemo(() => buildOutfitWeatherFacts(weather), [weather])
  return (
    <>
      <SmartCameraLiveView enabled onActiveChange={onCameraActive} />
      <p className="smart-camera-note">{outfitFeedbackDisclaimer}</p>
      {!outfitVisionReady && (
        <p>Jag kan inte bedöma färgkombinationer från kameran ännu. Använd spegeln i live-preview och vädret nedan.</p>
      )}
      {facts.available ? (
        <section className="smart-camera-weather">
          <h3>Väder just nu</h3>
          <p>{facts.facts.join(' · ')}</p>
          {facts.condition && <p>{facts.condition}</p>}
          {facts.lines.map((line) => <p key={line}>{line}</p>)}
        </section>
      ) : (
        <p className="smart-camera-note">{facts.note}</p>
      )}
    </>
  )
}

function WhereMode({ memory, onSave }) {
  const [itemLabel, setItemLabel] = useState('')
  const [placeLabel, setPlaceLabel] = useState('')
  const [query, setQuery] = useState('')

  function saveLocation() {
    const entry = createItemLocation({ itemLabel, placeLabel })
    if (!entry) return
    onSave({
      ...memory,
      locations: [entry, ...memory.locations.filter((item) => item.itemLabel.toLowerCase() !== entry.itemLabel.toLowerCase())],
    })
    setItemLabel('')
    setPlaceLabel('')
  }

  const match = findItemLocation(memory.locations, query)

  return (
    <>
      <p className="smart-camera-note">Kameran låtsas inte veta var ett föremål är. Svaren kommer bara från det du själv har sparat.</p>
      <div className="smart-camera-add-row">
        <input aria-label="Föremål" placeholder="Bilnyckel" value={itemLabel} onChange={(event) => setItemLabel(event.target.value)} />
        <input aria-label="Plats" placeholder="kökslådan" value={placeLabel} onChange={(event) => setPlaceLabel(event.target.value)} />
        <button className="secondary-button" type="button" onClick={saveLocation}>Spara plats</button>
      </div>
      <div className="smart-camera-add-row">
        <input aria-label="Var lade jag den" placeholder="Var lade jag bilnyckeln?" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {query && <p className="smart-camera-answer">{formatLocationAnswer(match, query)}</p>}
      <ul className="smart-camera-locations">
        {memory.locations.map((entry) => (
          <li key={entry.id}>
            <span>{entry.itemLabel} → {entry.placeLabel}</span>
            <button
              type="button"
              onClick={() => onSave({
                ...memory,
                locations: memory.locations.filter((item) => item.id !== entry.id),
              })}
            >
              Ta bort
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function RecallMode({ memory }) {
  const source = memory.checklists.find((list) => list.kind === 'carry')?.items || defaultCarryItems
  const [round, setRound] = useState(() => startRecallRound(source))
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)

  return (
    <>
      <p>{round.prompt}</p>
      {round.hidden && !result && <p className="smart-camera-hidden">Listan är dold.</p>}
      {result && (
        <section className="smart-camera-compare">
          <p>Resultat {result.score}</p>
          <p>Rätt: {result.matched.join(', ') || '—'}</p>
          <p>Saknades i svaret: {result.missed.join(', ') || '—'}</p>
        </section>
      )}
      <textarea
        aria-label="Skriv sakerna du minns"
        placeholder="Mobil, nycklar, plånbok..."
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />
      <div className="smart-camera-row">
        <button className="primary-button" type="button" onClick={() => setResult(compareRecallAnswer(round.items, answer))}>
          Jämför
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setResult(null)
            setAnswer('')
            setRound(startRecallRound(source))
          }}
        >
          Ny runda
        </button>
      </div>
      {result && (
        <ul>
          {round.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
      <section>
        <h3>Minnesmetoder</h3>
        {memoryTrainingMethods.map((method) => (
          <p key={method.id}><strong>{method.title}.</strong> {method.body}</p>
        ))}
      </section>
    </>
  )
}

function RoutinesMode({ memory, onSave }) {
  function ensureDefaults() {
    if (memory.routines.length) return
    onSave({ ...memory, routines: getDefaultRoutines() })
  }

  return (
    <>
      <p className="smart-camera-note">Rutiner sparas bara om du vill. Ingen dold profilering.</p>
      {memory.routines.length === 0 && (
        <button className="secondary-button" type="button" onClick={ensureDefaults}>Skapa start-rutiner</button>
      )}
      {memory.routines.map((routine) => (
        <section className="smart-camera-list-card" key={routine.id}>
          <div className="smart-camera-list-head">
            <strong>{routine.title}</strong>
            <button
              type="button"
              onClick={() => onSave({
                ...memory,
                routines: memory.routines.filter((item) => item.id !== routine.id),
              })}
            >
              Ta bort
            </button>
          </div>
          <p>{routine.items.join(', ')}</p>
        </section>
      ))}
    </>
  )
}

function LastCheckMode({ memory, onCameraActive, weather }) {
  const [done, setDone] = useState({})
  const facts = buildOutfitWeatherFacts(weather)
  const carry = memory.checklists.find((list) => list.kind === 'carry')

  return (
    <>
      <SmartCameraLiveView enabled onActiveChange={onCameraActive} />
      <ol className="smart-camera-last-check">
        {lastCheckSteps.map((step) => (
          <li key={step.id}>
            <label>
              <input
                checked={Boolean(done[step.id])}
                type="checkbox"
                onChange={() => setDone((current) => ({ ...current, [step.id]: !current[step.id] }))}
              />
              {step.label}
            </label>
          </li>
        ))}
      </ol>
      {carry && <p>Checklista: {carry.items.map((item) => item.label).join(', ')}</p>}
      {facts.available && <p>{facts.facts.join(' · ')}</p>}
      <p className="smart-camera-note">Sista kollen är en genomgång du bockar av själv. Kameran bevisar inte att något är klart.</p>
    </>
  )
}

function GetReadyMode({ memory, onSave }) {
  const todo = memory.checklists.find((list) => list.kind === 'todo')
    || createChecklist({ items: defaultTodoItems, kind: 'todo', title: 'Att göra' })
  const carry = memory.checklists.find((list) => list.kind === 'carry')
    || createChecklist({ items: defaultCarryItems, kind: 'carry', title: 'Att ta med' })

  function saveList(nextList) {
    const others = memory.checklists.filter((list) => list.id !== nextList.id && list.kind !== nextList.kind)
    const existing = memory.checklists.find((list) => list.kind === nextList.kind)
    onSave({
      ...memory,
      checklists: existing
        ? memory.checklists.map((list) => list.id === nextList.id || list.kind === nextList.kind ? nextList : list)
        : [...others, nextList],
    })
  }

  return (
    <>
      <p className="smart-camera-note">{getReadyPromptDisclaimer}</p>
      <h3>Att göra</h3>
      <ChecklistEditor list={todo} onChange={saveList} />
      <h3>Att ta med</h3>
      <ChecklistEditor list={carry} onChange={saveList} />
    </>
  )
}

function loadMemoryStateOrDefaults() {
  const loaded = loadMemoryState()
  if (loaded.checklists.length) return loaded
  return {
    ...loaded,
    checklists: [
      createChecklist({ items: defaultTodoItems, kind: 'todo', title: 'Att göra innan jag går ut' }),
      createChecklist({ items: defaultCarryItems, kind: 'carry', title: 'Att ta med' }),
    ],
  }
}

export default function SmartCameraModeViews({
  adapters,
  mode,
  onBack,
  onCameraActive,
  voiceBar,
}) {
  const [memory, setMemory] = useState(() => loadMemoryStateOrDefaults())
  const selected = mode
  const openedExistingRef = useRef(false)

  function persist(next) {
    setMemory(saveMemoryState(next))
  }

  useEffect(() => {
    if (openedExistingRef.current) return
    if (selected?.existing === 'body') {
      openedExistingRef.current = true
      adapters?.onOpenBodyScan?.()
    }
    if (selected?.existing === 'food') {
      openedExistingRef.current = true
      adapters?.onOpenFoodScan?.()
    }
  }, [adapters, selected])

  if (!selected) return null

  if (selected.existing === 'body' || selected.existing === 'food') {
    return (
      <>
        <ModeHeader mode={selected} onBack={onBack} />
        <p>Öppnar den befintliga funktionen.</p>
      </>
    )
  }

  const carryList = memory.checklists.find((list) => list.kind === 'carry')
    || createChecklist({ items: defaultCarryItems, kind: 'carry', title: 'Att ta med' })

  return (
    <div className="smart-camera-mode">
      <ModeHeader mode={selected} onBack={onBack} />
      {selected.id === 'check-me' && <CheckMeMode onCameraActive={onCameraActive} />}
      {selected.id === 'grooming' && (
        <>
          <SmartCameraLiveView enabled onActiveChange={onCameraActive} />
          <p className="smart-camera-note">{checkMeObservationDisclaimer}</p>
        </>
      )}
      {selected.id === 'outfit' && <OutfitMode onCameraActive={onCameraActive} weather={adapters?.weather} />}
      {(selected.id === 'items' || selected.id === 'pack') && (
        <ItemsMode
          list={selected.id === 'pack'
            ? memory.checklists.find((list) => list.contextId === 'travel') || createChecklist({
                contextId: 'travel',
                items: ['Pass/ID', 'Laddare', 'Hörlurar', 'Mediciner', 'Ombyte'],
                kind: 'carry',
                title: 'Resa',
              })
            : carryList}
          onCameraActive={onCameraActive}
          onChange={(nextList) => {
            const exists = memory.checklists.some((list) => list.id === nextList.id)
            persist({
              ...memory,
              checklists: exists
                ? memory.checklists.map((list) => list.id === nextList.id ? nextList : list)
                : [...memory.checklists, nextList],
            })
          }}
          usesCamera={selected.usesCamera}
        />
      )}
      {selected.id === 'forgotten' && (
        <ForgottenItemsCheck list={carryList} onBack={onBack} onCameraActive={onCameraActive} />
      )}
      {selected.id === 'get-ready' && <GetReadyMode memory={memory} onSave={persist} />}
      {selected.id === 'ask-ai' && (
        <>
          {voiceBar}
          <p className="smart-camera-note">
            Rösten använder samma AI Coach som resten av appen. Kamerabilder skickas inte med automatiskt.
          </p>
          <ul className="smart-camera-prompts">
            <li>Har jag glömt något?</li>
            <li>Ser min tröja ren ut?</li>
            <li>Vilken jacka passar?</li>
            <li>Vad borde jag ta med mig idag?</li>
            <li>Är jag klar att gå?</li>
          </ul>
        </>
      )}
      {selected.id === 'last-check' && (
        <LastCheckMode memory={memory} onCameraActive={onCameraActive} weather={adapters?.weather} />
      )}
      {selected.id === 'where' && <WhereMode memory={memory} onSave={persist} />}
      {selected.id === 'recall' && <RecallMode memory={memory} />}
      {selected.id === 'routines' && <RoutinesMode memory={memory} onSave={persist} />}
      {selected.id === 'eyes' && <p className="smart-camera-note">{eyesFeature.emptyState}</p>}
      {selected.id === 'mouth' && <p className="smart-camera-note">{mouthFeature.emptyState}</p>}
    </div>
  )
}
