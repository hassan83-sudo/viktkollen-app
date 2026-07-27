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

  return {
    containsFastFood: categories.has('fast_food'),
    containsSweets: categories.has('sweets') || categories.has('snack') || categories.has('soda'),
    energyDense: totals.calories >= 600 || totals.fat >= 25,
    largeMeal: totals.calories >= 850 || items.some((item) => item.quantity >= 2 && item.food.category === 'fast_food'),
    proteinRich: totals.protein >= 25,
  }
}

export function formatNutritionValue(value, unit = 'g') {
  if (!Number.isFinite(value)) return ''

  return `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}
