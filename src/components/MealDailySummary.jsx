function MealDailySummary({
  bestMeal,
  dailySummary,
  hasProtein,
  hasVegetables,
  mealCount,
  nextMealTip,
}) {
  return (
    <>
      <div className="chart-card">
        <div className="chart-toolbar">
          <div>
            <span>AI-sammanfattning</span>
            <strong>Dagens mat</strong>
          </div>
        </div>
        <p className="estimate-note">{dailySummary}</p>
        <p className="estimate-note">
          Proteinstatus:{' '}
          {hasProtein
            ? 'ser okej ut i dagens logg.'
            : 'syns inte tydligt ännu.'}
        </p>
        <p className="estimate-note">
          Grönsaksstatus:{' '}
          {hasVegetables
            ? 'grönsaker eller frukt verkar finnas med.'
            : 'lägg gärna till något grönt.'}
        </p>
        <p className="estimate-note">
          Fiber/kolhydratbalans:{' '}
          {bestMeal?.analysis?.fiberCarbBalance ||
            'välj gärna fullkorn, potatis, frukt eller grönsaker för mer fiber.'}
        </p>
        <p className="estimate-note">
          Enkel portionsbedömning:{' '}
          {bestMeal?.analysis?.portionEstimate ||
            'ingen tydlig bildbedömning ännu.'}
        </p>
        <p className="estimate-note">
          Dagens bästa måltid:{' '}
          {bestMeal?.summary || 'analysera en måltidsbild för att välja en.'}
        </p>
        <p className="estimate-note">
          Dagens förbättringsområde:{' '}
          {bestMeal?.improvementSuggestion || nextMealTip}
        </p>
        <p className="estimate-note">
          Billigt nästa måltidsförslag:{' '}
          {bestMeal?.analysis?.cheapNextMealSuggestion || nextMealTip}
        </p>
      </div>

      <div className="chart-card">
        <div className="chart-toolbar">
          <div>
            <span>Dagens mat</span>
            <strong>
              {mealCount} måltid{mealCount === 1 ? '' : 'er'} registrerade idag.
            </strong>
          </div>
        </div>
        <p className="estimate-note">
          {hasProtein
            ? 'Protein verkar finnas med i dagens måltider.'
            : 'Protein syns inte tydligt i dagens måltider ännu.'}
        </p>
        <p className="estimate-note">{nextMealTip}</p>
      </div>
    </>
  )
}

export default MealDailySummary
