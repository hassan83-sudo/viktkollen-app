import { memo, useEffect, useMemo, useState } from 'react'

function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function makeCheckInSummary({ checkIn, foodScore, foodTotal }) {
  const energy = Number(checkIn.energy)
  const steps = Number(checkIn.steps)
  const hasCheckIn = hasNumber(checkIn.energy) && hasNumber(checkIn.steps) && Boolean(checkIn.mood)

  if (!hasCheckIn) {
    return ''
  }

  const mood = checkIn.mood.toLocaleLowerCase('sv-SE')
  const foodProgress = foodTotal > 0 ? foodScore / foodTotal : 0
  const positives = []

  if (energy >= 7) {
    positives.push('Energin ser stark ut i dag')
  } else if (energy >= 4) {
    positives.push('Energin verkar ganska stabil')
  }

  if (steps >= 7000) {
    positives.push('du har fått in bra vardagsrörelse')
  } else if (steps >= 4000) {
    positives.push('du har redan kommit en bit med stegen')
  }

  if (foodProgress >= 0.5) {
    positives.push('matchecklistan rör sig åt rätt håll')
  }

  if (checkIn.workout) {
    positives.push('träningen eller den medvetna rörelsen är avklarad')
  }

  const opening = positives.length
    ? `${positives.slice(0, 2).join(' och ')}.`
    : `Det verkar vara en ${mood} dag, så det är klokt att hålla nivån enkel.`
  const moodSentence =
    energy <= 3
      ? `Med humöret ${mood} och låg energi behöver resten av dagen inte vara perfekt.`
      : `Humöret är ${mood}, vilket ger en bra signal om hur hårt du ska trycka på.`
  const nextStep =
    foodProgress < 0.5
      ? 'Nästa steg: ta vatten och välj ett enkelt proteinrikt mellanmål.'
      : steps < 7000
        ? 'Nästa steg: ta en kort promenad om kroppen känns okej.'
        : checkIn.workout
          ? 'Nästa steg: prioritera återhämtning och en lugn kväll.'
          : 'Nästa steg: välj en liten vana att avsluta dagen med.'

  return `${opening} ${moodSentence} ${nextStep}`
}

function CheckIn({ checkIn, foodScore, foodTotal, onUpdateCheckIn }) {
  const [localCheckIn, setLocalCheckIn] = useState(checkIn)
  const selectedEnergy = hasNumber(localCheckIn.energy) ? Number(localCheckIn.energy) : null
  const selectedSteps = hasNumber(localCheckIn.steps) ? Number(localCheckIn.steps) : null
  const checkInSummary = useMemo(
    () => makeCheckInSummary({ checkIn: localCheckIn, foodScore, foodTotal }),
    [foodScore, foodTotal, localCheckIn],
  )

  function updateLocalCheckIn(key, value) {
    setLocalCheckIn((current) => ({ ...current, [key]: value }))
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (localCheckIn.energy !== checkIn.energy) onUpdateCheckIn('energy', localCheckIn.energy)
      if (localCheckIn.steps !== checkIn.steps) onUpdateCheckIn('steps', localCheckIn.steps)
      if (localCheckIn.mood !== checkIn.mood) onUpdateCheckIn('mood', localCheckIn.mood)
      if (localCheckIn.workout !== checkIn.workout) onUpdateCheckIn('workout', localCheckIn.workout)
    }, 140)

    return () => window.clearTimeout(timeout)
  }, [checkIn, localCheckIn, onUpdateCheckIn])

  return (
    <article className="panel check-in-panel" id="checkin">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Dagens check-in</p>
          <h2>Hur dagen går</h2>
        </div>
      </div>

      <label className="field">
        <span>Energi</span>
        <input
          aria-valuetext={selectedEnergy === null ? 'Inte valt' : `${selectedEnergy} av 10`}
          type="range"
          min="1"
          max="10"
          value={selectedEnergy ?? 5}
          onChange={(event) =>
            updateLocalCheckIn('energy', Number(event.target.value))
          }
        />
        <strong>{selectedEnergy === null ? 'Inte valt' : `${selectedEnergy}/10`}</strong>
      </label>

      <label className="field">
        <span>Steg</span>
        <input
          type="number"
          min="0"
          step="100"
          placeholder="Ange steg"
          value={selectedSteps === null ? '' : selectedSteps}
          onChange={(event) =>
            updateLocalCheckIn('steps', event.target.value === '' ? null : Number(event.target.value))
          }
        />
      </label>

      <label className="field">
        <span>Humör</span>
        <select
          value={localCheckIn.mood}
          onChange={(event) => updateLocalCheckIn('mood', event.target.value)}
        >
          <option value="">Välj humör</option>
          <option value="Fokuserad">Fokuserad</option>
          <option value="Lugn">Lugn</option>
          <option value="Trött">Trött</option>
          <option value="Stressad">Stressad</option>
        </select>
      </label>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={Boolean(localCheckIn.workout)}
          onChange={(event) =>
            updateLocalCheckIn('workout', event.target.checked)
          }
        />
        <span>Träning eller medveten rörelse genomförd</span>
      </label>

      {checkInSummary && (
        <p className="estimate-note">{checkInSummary}</p>
      )}
    </article>
  )
}

export default memo(CheckIn)
