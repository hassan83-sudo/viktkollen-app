import { getUnifiedWeightFacts } from '../healthCalculations.js'

function round(value, decimals = 1) {
  if (!Number.isFinite(value)) return null
  return Number(value.toFixed(decimals))
}

function formatKg(value) {
  return Number.isFinite(value) ? `${Math.abs(value).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} kg` : 'Saknas'
}

function getWeightFacts(data = {}) {
  const snapshotFacts = data.healthSnapshot?.weight?.facts
  if (snapshotFacts) {
    return {
      currentWeight: snapshotFacts.currentWeight,
      goalRemaining: snapshotFacts.goalRemainingKg ?? snapshotFacts.goalRemaining,
      goalWeight: snapshotFacts.goalWeight,
      startWeight: snapshotFacts.startWeight,
      totalChange: snapshotFacts.totalChangeKg ?? snapshotFacts.totalChange,
    }
  }

  return getUnifiedWeightFacts({
    profile: data.profile,
    weights: data.weights,
  })
}

export function buildWeightGoalMilestones(data = {}) {
  const facts = getWeightFacts(data)
  const start = Number(facts.startWeight)
  const current = Number(facts.currentWeight)
  const goal = Number(facts.goalWeight)

  if (![start, current, goal].every(Number.isFinite) || goal < 35 || goal > 300 || start === goal) {
    return []
  }

  const distance = goal - start
  const completedDistance = current - start
  const losingWeight = distance < 0
  const percent = Math.max(0, Math.min(100, Math.abs(completedDistance) / Math.abs(distance) * 100))
  const checkpoints = [25, 50, 75, 100]

  return checkpoints.map((checkpoint) => {
    const rawTargetWeight = start + (distance * checkpoint / 100)
    const targetWeight = round(rawTargetWeight)
    const passed = losingWeight ? current <= rawTargetWeight : current >= rawTargetWeight

    return {
      category: 'weightProgress',
      currentPercent: round(percent, 1),
      description: checkpoint === 100
        ? 'Målvikt nådd enligt den centrala viktmodellen.'
        : `${checkpoint}% av vägen mot målet.`,
      id: `weight-goal-${checkpoint}`,
      progressPercent: Math.min(100, round(percent / checkpoint * 100, 1) || 0),
      status: passed ? 'reached' : 'upcoming',
      targetPercent: checkpoint,
      targetWeight,
      title: checkpoint === 100 ? 'Målvikten' : `Delmål ${checkpoint}%`,
      weightLabel: formatKg(targetWeight),
    }
  })
}

export function buildMilestones(data = {}) {
  const weightMilestones = buildWeightGoalMilestones(data)
  const reached = weightMilestones.filter((milestone) => milestone.status === 'reached')
  const upcoming = weightMilestones.find((milestone) => milestone.status === 'upcoming') || null

  return {
    latestReached: reached.at(-1) || null,
    milestones: weightMilestones,
    next: upcoming,
    reachedCount: reached.length,
    totalCount: weightMilestones.length,
  }
}
