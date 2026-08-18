function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export function ViktkollenCard({
  as: Element = 'article',
  children,
  className = '',
  variant = '',
  ...props
}) {
  return (
    <Element
      className={joinClassNames('vk-card', variant && `is-${variant}`, className)}
      {...props}
    >
      {children}
    </Element>
  )
}

export function ViktkollenSectionHeader({
  action,
  eyebrow,
  title,
  subtitle,
}) {
  return (
    <div className="vk-section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function ViktkollenButton({
  children,
  className = '',
  tone = 'primary',
  ...props
}) {
  return (
    <button className={joinClassNames('vk-button', `is-${tone}`, className)} type="button" {...props}>
      {children}
    </button>
  )
}

export function ViktkollenMetric({
  accent = 'cyan',
  label,
  value,
  detail,
  progress = null,
}) {
  const safeProgress = Number.isFinite(Number(progress))
    ? Math.max(0, Math.min(100, Number(progress)))
    : null

  return (
    <ViktkollenCard className={`vk-metric is-${accent}`}>
      <span className="vk-metric-icon" aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
      {safeProgress !== null && (
        <span className="vk-progress" aria-hidden="true">
          <span style={{ '--vk-progress-value': `${safeProgress}%` }} />
        </span>
      )}
    </ViktkollenCard>
  )
}

export function ViktkollenTabs({
  items,
  value,
  onChange,
  label = 'Välj vy',
}) {
  return (
    <div className="vk-tabs" aria-label={label}>
      {items.map((item) => (
        <button
          aria-pressed={item.value === value}
          className={item.value === value ? 'is-active' : ''}
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function ViktkollenEmptyState({
  actions,
  children,
  title,
}) {
  return (
    <ViktkollenCard className="vk-empty-state">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {actions && <div className="vk-empty-actions">{actions}</div>}
    </ViktkollenCard>
  )
}
