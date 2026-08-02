function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeGoalsHabitsLite(state = {}) {
  const source = state && typeof state === 'object' && !Array.isArray(state) ? state : {}

  return {
    goals: safeArray(source.goals),
    habits: safeArray(source.habits),
    weeklyFocus: safeArray(source.weeklyFocus),
  }
}

export function buildGoalsHabitsLiteSummary(state = {}) {
  const normalized = normalizeGoalsHabitsLite(state)
  const activeGoals = normalized.goals.filter((goal) => goal?.status !== 'archived' && goal?.status !== 'completed')
  const activeHabits = normalized.habits.filter((habit) => habit?.status !== 'archived')
  const activeFocus = normalized.weeklyFocus.filter((focus) => focus?.status === 'active').sort((first, second) => (first.order || 0) - (second.order || 0))
  const completedFocusCount = normalized.weeklyFocus.filter((focus) => focus?.status === 'completed').length
  const pendingHabits = activeHabits.filter((habit) => habit?.status !== 'paused').length

  if (!activeGoals.length && !activeHabits.length && !activeFocus.length) {
    return null
  }

  return {
    activeFocus: activeFocus.slice(0, 3).map((focus) => safeText(focus.title, 'Veckofokus')),
    activeGoals: activeGoals.map((goal) => ({
      progress: 'Följs i mål- och vanemotorn',
      title: safeText(goal.title, 'Mål'),
    })),
    completedFocusCount,
    consistencyPercent: 0,
    focusTitle: safeText(activeFocus[0]?.title),
    longestStreak: 0,
    manualHabitCount: activeHabits.filter((habit) => habit?.trackingMode === 'manual').length,
    nearestGoal: safeText(activeGoals[0]?.title),
    nextStep: activeFocus[0]?.action || activeFocus[0]?.reason || 'Välj en liten vana att upprepa.',
    pendingHabits,
    positiveProgress: activeFocus.length
      ? `${activeFocus.length} veckofokus är aktivt.`
      : `${activeHabits.length} vana${activeHabits.length === 1 ? '' : 'or'} följs.`,
    summary: `${activeGoals.length} aktiva mål, ${activeHabits.length} vanor och ${activeFocus.length} veckofokus.`,
    title: 'Mål & vanor',
  }
}
