function parseGoalNumbers(value) {
  if (!value) return []

  return String(value)
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) || []
}

export function parseProteinGoal(value) {
  if (Number.isFinite(value)) {
    return {
      label: `${value.toLocaleString('sv-SE')} g`,
      lower: value,
      target: value,
      upper: value,
    }
  }

  const numbers = parseGoalNumbers(value)

  if (!numbers.length) return null

  const lower = Math.min(...numbers)
  const upper = Math.max(...numbers)

  return {
    label: String(value),
    lower,
    target: lower,
    upper,
  }
}

export function calculateProteinGoalContribution(protein, proteinGoal) {
  const goal = parseProteinGoal(proteinGoal)

  if (!goal || !Number.isFinite(protein) || protein <= 0 || goal.target <= 0) {
    return null
  }

  return {
    goal,
    percent: Math.round((protein / goal.target) * 100),
  }
}
