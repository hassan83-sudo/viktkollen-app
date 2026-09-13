import { useEffect, useRef, useState } from 'react'
import {
  applyServiceWorkerUpdate,
  isStandaloneDisplayMode,
  PWA_APP_VERSION,
  PWA_CACHE_VERSION,
  registerServiceWorker,
  requestServiceWorkerUpdate,
} from '../registerServiceWorker.js'

function getInitialOnlineStatus() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

function PwaDiagnostics({
  installed,
  online,
  serviceWorkerStatus,
  showDiagnostics = false,
  updateAvailable,
}) {
  if (!import.meta.env.DEV || !showDiagnostics) return null

  return (
    <details className="pwa-diagnostics">
      <summary>PWA diagnostics</summary>
      <dl>
        <div><dt>Service worker</dt><dd>{serviceWorkerStatus}</dd></div>
        <div><dt>Cache version</dt><dd>{PWA_CACHE_VERSION}</dd></div>
        <div><dt>Installerad</dt><dd>{installed ? 'Ja' : 'Nej'}</dd></div>
        <div><dt>Nätverk</dt><dd>{online ? 'Online' : 'Offline'}</dd></div>
        <div><dt>Ny version</dt><dd>{updateAvailable ? 'Ja' : 'Nej'}</dd></div>
        <div><dt>Appversion</dt><dd>{PWA_APP_VERSION}</dd></div>
      </dl>
    </details>
  )
}

function PwaExperience({ showDiagnostics = false }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(() => isStandaloneDisplayMode())
  const [installStatus, setInstallStatus] = useState('')
  const [online, setOnline] = useState(getInitialOnlineStatus)
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState('not-registered')
  const [updateRegistration, setUpdateRegistration] = useState(null)
  const registrationRef = useRef(null)
  const controllerChangeHandledRef = useRef(false)
  const updateRequestedRef = useRef(false)

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      requestServiceWorkerUpdate(registrationRef.current)
    }

    function handleOffline() {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      if (isStandaloneDisplayMode()) return

      event.preventDefault()
      setDeferredPrompt(event)
      setInstallStatus('')
    }

    function handleInstalled() {
      setDeferredPrompt(null)
      setInstalled(true)
      setInstallStatus('Viktkollen är installerad.')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    let cleanupRegistration = () => {}
    let updateInterval = null

    function applyAvailableUpdate(registration) {
      setUpdateRegistration(registration)
      setServiceWorkerStatus('updating')
      updateRequestedRef.current = true
      applyServiceWorkerUpdate(registration)
    }

    registerServiceWorker({
      onStatusChange: setServiceWorkerStatus,
      onUpdateAvailable: applyAvailableUpdate,
    }).then((result) => {
      if (result.cleanup) cleanupRegistration = result.cleanup
      if (!result.registration) return

      registrationRef.current = result.registration
      requestServiceWorkerUpdate(result.registration)
      updateInterval = window.setInterval(() => {
        requestServiceWorkerUpdate(registrationRef.current)
      }, 5 * 60 * 1000)
    })

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        requestServiceWorkerUpdate(registrationRef.current)
      }
    }

    function handleControllerChange() {
      setServiceWorkerStatus('activated')
      setUpdateRegistration(null)

      // Reload once whenever a new root worker takes control. This also migrates
      // older iPhone installations that were controlled by place-push-sw.js.
      if (!controllerChangeHandledRef.current) {
        controllerChangeHandledRef.current = true
        window.location.reload()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    navigator.serviceWorker?.addEventListener?.('controllerchange', handleControllerChange)

    return () => {
      cleanupRegistration()
      if (updateInterval) window.clearInterval(updateInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      navigator.serviceWorker?.removeEventListener?.('controllerchange', handleControllerChange)
    }
  }, [])

  async function installApp() {
    if (!deferredPrompt) return

    const promptEvent = deferredPrompt
    setDeferredPrompt(null)

    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice

      if (choice?.outcome === 'accepted') {
        setInstallStatus('Installationen startade.')
      } else {
        setInstallStatus('Installationen avbröts.')
      }
    } catch {
      setInstallStatus('Installationen kunde inte starta just nu.')
    }
  }

  function updateNow() {
    const registration = updateRegistration || registrationRef.current
    if (!registration) return

    updateRequestedRef.current = true
    setServiceWorkerStatus('updating')

    const requested = applyServiceWorkerUpdate(registration)
    if (!requested) requestServiceWorkerUpdate(registration)
  }

  const showInstallButton = Boolean(deferredPrompt && !installed)

  return (
    <aside className="pwa-experience" aria-label="Appstatus">
      {!online && (
        <div className="pwa-banner is-offline" role="status" aria-live="polite">
          <strong>Offline</strong>
          <span>Du kan fortsätta använda tidigare öppnad appvy. Moln- och nätfunktioner väntar tills nätet är tillbaka.</span>
        </div>
      )}

      {updateRegistration && (
        <div className="pwa-banner is-update" role="status" aria-live="polite">
          <div>
            <strong>Ny version hämtas</strong>
            <span>Viktkollen uppdateras automatiskt. Lokal data sparas kvar.</span>
          </div>
          <button type="button" onClick={updateNow}>
            Uppdatera nu
          </button>
        </div>
      )}

      {showInstallButton && (
        <div className="pwa-install-card" role="status" aria-live="polite">
          <span>Installera Viktkollen för snabbare åtkomst.</span>
          <button type="button" onClick={installApp}>
            Installera appen
          </button>
        </div>
      )}

      {installStatus && (
        <p className="pwa-status-message" role="status" aria-live="polite">
          {installStatus}
        </p>
      )}

      <div className={`pwa-network-pill ${online ? 'is-online' : 'is-offline'}`} aria-live="polite">
        {online ? 'Online' : 'Offline'}
      </div>

      <PwaDiagnostics
        installed={installed}
        online={online}
        serviceWorkerStatus={serviceWorkerStatus}
        showDiagnostics={showDiagnostics}
        updateAvailable={Boolean(updateRegistration)}
      />
    </aside>
  )
}

export default PwaExperience
