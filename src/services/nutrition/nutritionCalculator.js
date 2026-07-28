const round = (value) => Math.round((value + Number.EPSILON) * 10) / 10

export function multiplyFoodNutrition(food, quantity = 1) {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1

  return {
    calories: round(food.calories * safeQuantity),
    carbs: round(food.carbs * safeQuantity),
    fat: round(food.fat * safeQuantity),
    protein: round(food.protein * safeQuantity),
  }
}

export function calculateNutritionForGrams(food, grams) {
  const safeGrams = Number.isFinite(grams) && grams > 0 ? grams : 0
  const factor = safeGrams / 100

  return {
    calories: round(food.caloriesPer100g * factor),
    carbs: round(food.carbsPer100g * factor),
    fat: round(food.fatPer100g * factor),
    protein: round(food.proteinPer100g * factor),
  }
}

export function sumMealNutrition(items) {
  return items.reduce(
    (total, item) => ({
      calories: round(total.calories + item.nutrition.calories),
      carbs: round(total.carbs + item.nutrition.carbs),
      fat: round(total.fat + item.nutrition.fat),
      protein: round(total.protein + item.nutrition.protein),
    }),
    {
      calories: 0,
      carbs: 0,
      fat: 0,
      protein: 0,
    },
  )
}

export function buildMealFlags(items, totals) {
  const categories = new Set(items.map((item) => item.food.category))
  const hasVegetable = categories.has('vegetable')
  const hasFruit = categories.has('fruit')
  const hasProtein = categories.has('protein') || totals.protein >= 20
  const hasCarb = categories.has('carb')

  return {
    balancedMeal: hasProtein && (hasVegetable || hasFruit) && (hasCarb || totals.calories >= 300),
    containsFastFood: categories.has('fast_food'),
    containsFruit: hasFruit,
    containsVegetables: hasVegetable,
    containsSweets: categories.has('sweets') || categories.has('snack') || categories.has('soda'),
    energyDense: totals.calories >= 600 || totals.fat >= 25,
    lowProtein: totals.calories >= 250 && totals.protein < 15,
    largeMeal: totals.calories >= 850 || items.some((item) => item.quantity >= 2 && item.food.category === 'fast_food'),
    proteinRich: totals.protein >= 24,
  }
}

export function formatNutritionValue(value, unit = 'g') {
  if (!Number.isFinite(value)) return ''

  return `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

export function formatApproxCalories(value) {
  if (!Number.isFinite(value)) return ''

  const rounded = value >= 100 ? Math.round(value / 5) * 5 : Math.round(value)

  return `cirka ${rounded.toLocaleString('sv-SE')} kcal`
}

export function formatApproxGrams(value, label = 'g') {
  if (!Number.isFinite(value)) return ''

  const rounded = value < 10 && value % 1 !== 0
    ? Math.round(value * 10) / 10
    : Math.round(value)

  return `${rounded.toLocaleString('sv-SE')} ${label}`
}
