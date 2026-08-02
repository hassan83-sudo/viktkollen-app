function ReportNextActions({ items = [] }) {
  return (
    <section className="report-v3-card">
      <h3>Nästa rimliga steg</h3>
      {items.length ? (
        <ol className="report-v3-list">
          {items.map((item) => (
            <li key={`${item.title}-${item.text}`}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p>Logga en vanlig dag så kan nästa steg bli tydligare.</p>
      )}
    </section>
  )
}

export default ReportNextActions
