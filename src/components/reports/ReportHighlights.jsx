function ReportHighlights({ emptyText = 'Inga tydliga highlights ännu.', items = [], title = 'Highlights' }) {
  return (
    <section className="report-v3-card">
      <h3>{title}</h3>
      {items.length ? (
        <ul className="report-v3-list">
          {items.map((item) => (
            <li key={`${item.title}-${item.text}`}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  )
}

export default ReportHighlights
