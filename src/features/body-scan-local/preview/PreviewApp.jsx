import { useState } from 'react'

import LocalBodyScan from '../components/LocalBodyScan.jsx'
import { clearLocalScanRecords } from '../localBodyScanStore.js'
import { previewTestScope } from './previewGuard.js'

export function PreviewShell() {
  const [testMode, setTestMode] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)

  return (
    <main className="body-scan-preview-shell">
      <p className="eyebrow">Viktkollen · Preview-test</p>
      <h1>Lokal kroppsscanning</h1>
      <ul className="body-scan-preview-facts">
        <li>Endast för test i Vercel Preview. Inte aktiverat för riktiga användare.</li>
        <li>Ingen inloggning, ingen molnsynk, inga API-anrop och ingen databas används på den här sidan.</li>
        <li>Kroppsbilder analyseras bara på mobilen och sparas eller skickas aldrig.</li>
        <li>Bara analysvärden du själv godkänner sparas – under ett separat testkonto på den här enheten.</li>
        <li>Gamla data rensas eller migreras inte här.</li>
      </ul>
      {!testMode ? (
        <button className="primary-button" type="button" onClick={() => setTestMode(true)}>
          Aktivera testläge
        </button>
      ) : (
        <>
          <div className="progress-upload">
            <LocalBodyScan key={sessionKey} scope={previewTestScope} showLegacyCleanup={false} weights={[]} />
          </div>
          <div className="body-scan-preview-actions">
            <button className="secondary-button" type="button" onClick={() => setSessionKey((key) => key + 1)}>
              Börja om testet
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                clearLocalScanRecords(previewTestScope)
                setSessionKey((key) => key + 1)
              }}
            >
              Radera testets analysvärden
            </button>
            <button className="secondary-button" type="button" onClick={() => setTestMode(false)}>
              Stäng testläget
            </button>
          </div>
        </>
      )}
    </main>
  )
}

export function Blocked() {
  return (
    <main className="body-scan-preview-shell">
      <h1>Inte tillgänglig</h1>
      <p>Den här testsidan finns bara i Viktkollens Preview-miljö.</p>
    </main>
  )
}
