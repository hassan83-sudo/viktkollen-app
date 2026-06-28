function MealList({ meals }) {
  return (
    <ul className="meal-list">
      {meals.map((meal) => (
        <li key={meal.id}>
          <strong>{meal.type}</strong>
          <span>{meal.text}</span>
        </li>
      ))}
    </ul>
  )
}

export default MealList
