function ProductList({ products }) {
  return (
    <ul className="product-list">
      {products.map((product) => (
        <li key={`${product.barcode}-${product.id}`}>
          <div>
            <strong>{product.name}</strong>
            <span>{product.barcode}</span>
          </div>
          <dl>
            <div>
              <dt>Kalorier</dt>
              <dd>{product.calories} kcal</dd>
            </div>
            <div>
              <dt>Protein</dt>
              <dd>{product.protein} g</dd>
            </div>
            <div>
              <dt>Kolhydrater</dt>
              <dd>{product.carbs} g</dd>
            </div>
            <div>
              <dt>Fett</dt>
              <dd>{product.fat} g</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}

export default ProductList
