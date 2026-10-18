import { useTranslation } from 'react-i18next'

function MealDailySummary({
  bestMeal,
  dailySummary,
  hasProtein,
  hasVegetables,
  mealCount,
  nextMealTip,
}) {
  const { t } = useTranslation('home')
  return (
    <>
      <div className="chart-card">
        <div className="chart-toolbar">
          <div>
            <span>{t('mealDaily.aiSummary')}</span>
            <strong>{t('mealDaily.todaysFood')}</strong>
          </div>
        </div>
        <p className="estimate-note">{dailySummary}</p>
        <p className="estimate-note">
          {t('mealDaily.proteinStatus')}{' '}
          {hasProtein
            ? t('mealDaily.proteinOk')
            : t('mealDaily.proteinMissing')}
        </p>
        <p className="estimate-note">
          {t('mealDaily.vegetableStatus')}{' '}
          {hasVegetables
            ? t('mealDaily.vegetableOk')
            : t('mealDaily.vegetableMissing')}
        </p>
        <p className="estimate-note">
          {t('mealDaily.fiberBalance')}{' '}
          {bestMeal?.analysis?.fiberCarbBalance ||
            t('mealDaily.fiberTip')}
        </p>
        <p className="estimate-note">
          {t('mealDaily.portion')}{' '}
          {bestMeal?.analysis?.portionEstimate ||
            t('mealDaily.noPortion')}
        </p>
        <p className="estimate-note">
          {t('mealDaily.bestMeal')}{' '}
          {bestMeal?.summary || t('mealDaily.noBestMeal')}
        </p>
        <p className="estimate-note">
          {t('mealDaily.improvement')}{' '}
          {bestMeal?.improvementSuggestion || nextMealTip}
        </p>
        <p className="estimate-note">
          {t('mealDaily.cheapNext')}{' '}
          {bestMeal?.analysis?.cheapNextMealSuggestion || nextMealTip}
        </p>
      </div>

      <div className="chart-card">
        <div className="chart-toolbar">
          <div>
            <span>Dagens mat</span>
            <strong>
              {t('mealDaily.mealsRegistered', { count: mealCount })}
            </strong>
          </div>
        </div>
        <p className="estimate-note">
          {hasProtein
            ? t('mealDaily.proteinMealsOk')
            : t('mealDaily.proteinMealsMissing')}
        </p>
        <p className="estimate-note">{nextMealTip}</p>
      </div>
    </>
  )
}

export default MealDailySummary
