import { useCallback, useEffect, useState } from 'react'

const STATUS_LABELS = {
  acknowledged: 'Sedd',
  new: 'Ny',
  recurring: 'Återkommande',
}

const SEVERITY_LABELS = {
  high: 'Hög',
  low: 'Låg',
  medium: 'Medel',
}

async function adminFetch(token, options = {}) {
  const response = await fetch('/api/bug-monitor', {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  return { payload, response }
}

export default function BugMonitorPanel({ token }) {
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  const [overview, setOverview] = useState(null)
  const [plan, setPlan] = useState(null)

  const load = useCallback(async () => {
    const result = await adminFetch(token)
    if (!result.response.ok || result.payload?.ok !== true || !result.payload.summary) {
      setNotice('Felöversikten kunde inte läsas.')
      return
    }
    setNotice('')
    setOverview(result.payload)
  }, [token])

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [load, open])

  function onToggle(event) {
    const next = event.currentTarget.open
    setOpen(next)
    if (next) load()
  }

  async function prepare(fingerprint) {
    setPlan(null)
    const result = await adminFetch(token, {
      body: JSON.stringify({ action: 'plan', fingerprint }),
      method: 'POST',
    })
    if (!result.response.ok || result.payload?.plan?.ok !== true) {
      setNotice('Undersökningen kunde inte förberedas.')
      return
    }
    setNotice('')
    setPlan(result.payload.plan)
  }

  const summary = overview?.summary

  return (
    <details
      onToggle={onToggle}
    >
      <summary>AI Bug Monitor</summary>
      {open && (
        <>
          <p>Översikten sparas i databasen. Bara en administratör kan läsa den.</p>
          {notice ? <p>{notice}</p> : null}
          {summary ? (
            <>
              <p>{`Nya fel ${summary.newCount}`}</p>
              <p>{`Återkommande ${summary.recurringCount}`}</p>
              <p>{`Drabbade ${summary.affectedCount}`}</p>
              {summary.groups.length === 0 ? <p>Inga tekniska fel är insamlade.</p> : null}
              <ul>
                {summary.groups.map((group) => (
                  <li key={group.fingerprint}>
                    <span>{group.fingerprint}</span>
                    {' '}
                    <span>{group.feature}</span>
                    {' '}
                    <span>{SEVERITY_LABELS[group.severity] || 'Medel'}</span>
                    {' '}
                    <span>{STATUS_LABELS[group.status] || group.status}</span>
                    {' '}
                    <span>{`Antal ${group.count}`}</span>
                    {' '}
                    <span>{`Drabbade ${group.affectedCount}`}</span>
                    <button type="button" onClick={() => prepare(group.fingerprint)}>
                      {`Förbered undersökning ${group.fingerprint}`}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {plan?.proposal ? (
            <>
              <p>{`Gren ${plan.proposal.branch}`}</p>
              <p>{plan.proposal.suggestedChange}</p>
              <p>Merge, produktionsdeploy och databasändring körs inte. De kräver ett senare godkännande.</p>
              <p>{`Test ${plan.proposal.tests.join(', ')}`}</p>
            </>
          ) : null}
        </>
      )}
    </details>
  )
}
