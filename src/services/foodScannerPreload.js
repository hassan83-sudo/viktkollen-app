// Hämtar matscannerns appdelar i förväg (Mat-sidans måltidslogg och själva
// skannern). Samma moduler som React.lazy laddar, så de återanvänds direkt.
let preload = null

export function preloadFoodScanner() {
  if (!preload) {
    preload = Promise.all([
      import('../components/MealLogger.jsx'),
      import('../components/NutritionScannerV2.jsx'),
    ]).catch(() => {
      preload = null
      return null
    })
  }
  return preload
}
