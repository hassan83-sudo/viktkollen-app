function ReportAttentionItems({ items = [] }) {
  return (
    <section className="report-v3-card">
      <h3>Uppmärksamhet</h3>
      {items.length ? (
        <ul className="report-v3-list">
          {items.map((item) => (
            <li key={`${item.title}-${item.text}`}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
              {item.action && <small>{item.action}</small>}
            </li>
          ))}
        </ul>
      ) : (
        <p>Inga tydliga uppmärksamhetspunkter just nu.</p>
      )}
    </section>
  )
}

export default ReportAttentionItems
