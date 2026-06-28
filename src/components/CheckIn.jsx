function makeCheckInSummary({ checkIn, foodScore, foodTotal }) {
  const hasCheckIn =
    Number.isFinite(checkIn.energy) &&
    Number.isFinite(checkIn.steps) &&
    Boolean(checkIn.mood)

  if (!hasCheckIn) {
    return ''
  }

  const mood = checkIn.mood.toLocaleLowerCase('sv-SE')
  const foodProgress = foodTotal > 0 ? foodScore / foodTotal : 0
  const positives = []

  if (checkIn.energy >= 7) {
    positives.push('Energin ser stark ut i dag')
  } else if (checkIn.energy >= 4) {
    positives.push('Energin verkar ganska stabil')
  }

  if (checkIn.steps >= 7000) {
    positives.push('du har fått in bra vardagsrörelse')
  } else if (checkIn.steps >= 4000) {
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
    checkIn.energy <= 3
      ? `Med humöret ${mood} och låg energi behöver resten av dagen inte vara perfekt.`
      : `Humöret är ${mood}, vilket ger en bra signal om hur hårt du ska trycka på.`
  const nextStep =
    foodProgress < 0.5
      ? 'Nästa steg: ta vatten och välj ett enkelt proteinrikt mellanmål.'
      : checkIn.steps < 7000
        ? 'Nästa steg: ta en kort promenad om kroppen känns okej.'
        : checkIn.workout
          ? 'Nästa steg: prioritera återhämtning och en lugn kväll.'
          : 'Nästa steg: välj en liten vana att avsluta dagen med.'

  return `${opening} ${moodSentence} ${nextStep}`
}

function CheckIn({ checkIn, foodScore, foodTotal, onUpdateCheckIn }) {
  const checkInSummary = makeCheckInSummary({ checkIn, foodScore, foodTotal })

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
          type="range"
          min="1"
          max="10"
          value={checkIn.energy}
          onChange={(event) =>
            onUpdateCheckIn('energy', Number(event.target.value))
          }
        />
        <strong>{checkIn.energy}/10</strong>
      </label>

      <label className="field">
        <span>Steg</span>
        <input
          type="number"
          min="0"
          step="100"
          value={checkIn.steps}
          onChange={(event) =>
            onUpdateCheckIn('steps', Number(event.target.value))
          }
        />
      </label>

      <label className="field">
        <span>Humör</span>
        <select
          value={checkIn.mood}
          onChange={(event) => onUpdateCheckIn('mood', event.target.value)}
        >
          <option>Fokuserad</option>
          <option>Lugn</option>
          <option>Trött</option>
          <option>Stressad</option>
        </select>
      </label>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={checkIn.workout}
          onChange={(event) =>
            onUpdateCheckIn('workout', event.target.checked)
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

export default CheckIn
