import RecipeCard from './RecipeCard.jsx'

function RecipeList({
  dietaryPreferences,
  onCreateTemplate,
  onDelete,
  onDuplicate,
  onEdit,
  onToggleFavorite,
  recipes,
}) {
  if (!recipes.length) {
    return (
      <div className="nutrition-empty">
        <strong>Inga recept ännu.</strong>
        <span>Skapa ett recept för att återanvända det i mallar, planering och inköpslista.</span>
      </div>
    )
  }

  return (
    <div className="recipe-list">
      {recipes.map((recipe) => (
        <RecipeCard
          dietaryPreferences={dietaryPreferences}
          key={recipe.id}
          recipe={recipe}
          onCreateTemplate={onCreateTemplate}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  )
}

export default RecipeList
