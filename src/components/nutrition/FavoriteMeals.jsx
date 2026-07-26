function FavoriteMeals({
  favorites,
  onAddFavorite,
  onDeleteFavorite,
  onEditFavorite,
  onSearchChange,
  search,
}) {
  return (
    <section className="nutrition-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Snabbval</p>
          <h3>Favoritmåltider</h3>
        </div>
      </div>
      <label className="field">
        <span>Sök favoriter</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Sök bland favoriter"
        />
      </label>
      {favorites.length === 0 ? (
        <div className="nutrition-empty">
          <strong>Inga favoriter ännu.</strong>
          <span>Spara en måltid som favorit för snabbare registrering.</span>
        </div>
      ) : (
        <div className="favorite-meal-list">
          {favorites.map((favorite) => (
            <article key={favorite.id}>
              <div>
                <strong>{favorite.name}</strong>
                <span>{favorite.type} · {favorite.description || 'Ingen beskrivning'}</span>
              </div>
              <div className="nutrition-actions">
                <button className="secondary-button" type="button" onClick={() => onAddFavorite(favorite)}>Lägg till idag</button>
                <button className="secondary-button" type="button" onClick={() => onEditFavorite(favorite)}>Redigera</button>
                <button className="secondary-button danger-button" type="button" onClick={() => onDeleteFavorite(favorite.id)}>Ta bort</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default FavoriteMeals
