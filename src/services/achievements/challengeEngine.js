import { getEntryLocalDate, getLocalDateString } from '../localDate.js'
import { validateAchievementSafety } from './achievementSafety.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function isActualMeal(meal = {}) {
  return meal?.planned !== true && meal?.status !== 'planned' && meal?.source !== 'weekly-plan'
}

function getMealDate(meal = {}) {
  return getEntryLocalDate(meal) || ''
}

function challenge(id, title, description, actionText, progress, target, source) {
  const definition = {
    category: 'appMilestones',
    description,
    id,
    safetyCategory: 'safe_motivation',
    title,
    xp: 15,
  }
  const safety = validateAchievementSafety(definition)

  if (!safety.ok) return null

  return {
    actionText,
    description,
    id,
    progress,
    source,
    status: progress >= target ? 'completed' : progress > 0 ? 'active' : 'suggested',
    target,
    title,
  }
}

export function buildAchievementChallenges(data = {}, options = {}) {
  const today = getLocalDateString(options.analysisDate || data.today || new Date())
  const meals = safeArray(data.meals).filter(isActualMeal)
  const todayMeals = meals.filter((meal) => getMealDate(meal) === today)
  const checkIns = safeArray(data.checkIns)
  const todayCheckIns = [
    ...checkIns,
    data.checkIn,
  ].filter(Boolean).filter((entry) => getLocalDateString(entry.date || entry.createdAt || entry.updatedAt || today) === today)
  const activeHabits = safeArray(data.goalsHabits?.habits).filter((habit) => habit.status === 'active')
  const activeGoals = safeArray(data.goalsHabits?.goals).filter((goal) => goal.status === 'active')
  const weeklyFocus = safeArray(data.goalsHabits?.weeklyFocus).filter((focus) => focus.status === 'active')

  return [
    todayMeals.length === 0
      ? challenge('today-balanced-meal', 'Logga en vanlig måltid', 'En enkel måltidslogg räcker för att göra dagens analys tydligare.', 'Logga måltid', 0, 1, 'meals')
      : challenge('today-meal-done', 'Måltid registrerad idag', 'Dagens måltidsunderlag finns redan.', 'Visa måltider', todayMeals.length, 1, 'meals'),
    todayCheckIns.length === 0
      ? challenge('today-check-in', 'Gör en kort check-in', 'Energi, humör och steg gör råden mer personliga.', 'Gör check-in', 0, 1, 'checkIns')
      : challenge('today-check-in-done', 'Check-in finns idag', 'Dagens check-in stärker coachens underlag.', 'Visa check-in', todayCheckIns.length, 1, 'checkIns'),
    activeHabits.length > 0
      ? challenge('habit-next-step', 'Ta nästa vana', 'Välj en aktiv vana som är rimlig idag.', 'Öppna mål och vanor', 0, 1, 'goalsHabits')
      : null,
    activeGoals.length > 0 || weeklyFocus.length > 0
      ? challenge('weekly-focus-review', 'Se över veckans fokus', 'En kort avstämning räcker för att hålla riktningen tydlig.', 'Öppna veckofokus', weeklyFocus.length, 1, 'goalsHabits')
      : null,
  ].filter(Boolean).slice(0, 3)
}
