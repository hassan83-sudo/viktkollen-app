import { Suspense, useEffect, useState } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CloudBackupPanel from '../CloudBackupPanel.jsx'
import CloudStatusPanel from '../CloudStatusPanel.jsx'
import CloudSyncPanel from '../CloudSyncPanel.jsx'
import MoreGoalsFolder from '../more/MoreGoalsFolder.jsx'
import MoreHub from '../more/MoreHub.jsx'
import NotificationCenter from '../NotificationCenter.jsx'
import ReminderCenter from '../ReminderCenter.jsx'
import ReminderSettings from '../ReminderSettings.jsx'
import AppSection from '../app/AppSection.jsx'
import GlobalSearch from '../app/GlobalSearch.jsx'
import LazySectionFallback from '../app/LazySectionFallback.jsx'
import { resolveMoreFolderFromTarget } from '../../services/more/moreFolders.js'
import {
  clearLocalViktkollenData,
  requestAccountDeletion as requestAccountDeletion,
} from '../../services/accountDeletionClient.js'
import {
  readNutritionRemoteConsent,
  revokeNutritionRemoteConsent,
} from '../../services/nutritionRemoteConsent.js'

function MoreSection({
  activeSection,
  adaptiveCoachFeedback,
  authLoading,
  checkIn,
  email,
  goalsHabits,
  healthSnapshot,
  isAuthenticated,
  meals,
  navigationIntent,
  nutritionGoals,
  onDataRestored,
  onEditProfile,
  onReminderSettingChange,
  onReminderStateChange,
  onRequestNotificationPermission,
  onSearchNavigate,
  onSignOut,
  profileCompleteness,
  reminderOptions,
  reminderSettings,
  reminderState,
  reminderStatus,
  schedulerStatus,
  selectedMealDate,
  DataExportCenterComponent,
  DataImportCenterComponent,
  SyncHealthDashboardComponent,
  showInternalTools = false,
  syncStatus,
  userId,
  profile,
  weights,
}) {
  const DataExportCenter = DataExportCenterComponent
  const DataImportCenter = DataImportCenterComponent
  const SyncHealthDashboard = SyncHealthDashboardComponent
  const [activeFolder, setActiveFolder] = useState(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteStatus, setDeleteStatus] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [storedNutritionConsent, setStoredNutritionConsent] = useState(() => ({
    consent: readNutritionRemoteConsent(userId),
    userId,
  }))
  const nutritionRemoteConsent = storedNutritionConsent.userId === userId
    ? storedNutritionConsent.consent
    : readNutritionRemoteConsent(userId)

  useEffect(() => {
    if (activeSection !== 'more') return

    const targetId = navigationIntent?.targetId || String(window.location.hash || '').replace(/^#/, '')
    const folder = resolveMoreFolderFromTarget(targetId)
    if (folder) setActiveFolder(folder)
  }, [activeSection, navigationIntent])

  useEffect(() => {
    function syncFolderFromHash() {
      const folder = resolveMoreFolderFromTarget(String(window.location.hash || '').replace(/^#/, ''))
      if (folder) setActiveFolder(folder)
    }

    window.addEventListener('hashchange', syncFolderFromHash)
    return () => window.removeEventListener('hashchange', syncFolderFromHash)
  }, [])

  useEffect(() => {
    if (activeSection !== 'more' || !activeFolder) return

    const targetId = navigationIntent?.targetId || String(window.location.hash || '').replace(/^#/, '')
    if (!targetId || targetId === activeFolder) return

    const scrollToTarget = () => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const timers = [80, 240, 480].map((delay) => window.setTimeout(scrollToTarget, delay))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [activeFolder, activeSection, navigationIntent])

  async function handleCheckDeletionReadiness() {
    setIsDeletingAccount(true)
    setDeleteStatus('')

    const result = await requestAccountDeletion({ mode: 'dry-run' })
    setIsDeletingAccount(false)
    setDeleteStatus(result.ok
      ? 'Serverkontraktet svarar. Molndata och kontoradering kräver fortsatt rätt serverkonfiguration.'
      : result.error?.safeMessage || 'Kontoradering kunde inte kontrolleras.')
  }

  async function handleDeleteAccount() {
    if (deleteConfirmation.trim().toLocaleLowerCase('sv-SE') !== 'radera konto') {
      setDeleteStatus('Skriv exakt: radera konto')
      return
    }

    setIsDeletingAccount(true)
    setDeleteStatus('')
    const result = await requestAccountDeletion({ mode: 'account' })
    setIsDeletingAccount(false)

    if (!result.ok) {
      setDeleteStatus(result.error?.safeMessage || 'Kontot kunde inte raderas säkert.')
      return
    }

    const localResult = clearLocalViktkollenData()
    setDeleteStatus(localResult.ok
      ? 'Kontodata raderades. Du loggas ut.'
      : 'Servern raderade kontodata, men lokal rensning blev delvis ofullständig.')
    await onSignOut?.()
  }

  function handleBackToHub() {
    setActiveFolder(null)
    const hash = String(window.location.hash || '').replace(/^#/, '')
    if (resolveMoreFolderFromTarget(hash) && hash !== 'app-section-more') {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#app-section-more`,
      )
    }
  }

  function handleRevokeNutritionRemoteConsent() {
    setStoredNutritionConsent({
      consent: revokeNutritionRemoteConsent(userId),
      userId,
    })
  }

  return (
    <AppSection
      activeSection={activeSection}
      id="more"
      label="Fler funktioner och inställningar"
    >
      <MoreHub
        activeFolder={activeFolder}
        isAuthenticated={isAuthenticated}
        syncStatus={syncStatus}
        onBack={handleBackToHub}
        onOpen={setActiveFolder}
      >
        {activeFolder === 'sakerhet-backup' && (
          <AppErrorBoundary
            area="cloud"
            resetKey={userId}
            title="Molnstatus kunde inte visas"
          >
            <CloudStatusPanel isAuthenticated={isAuthenticated} />
            <CloudSyncPanel
              isAuthenticated={isAuthenticated}
              onDataChanged={onDataRestored}
              userId={userId}
            />
            <CloudBackupPanel
              isAuthenticated={isAuthenticated}
              onDataRestored={onDataRestored}
              variant="security"
            />
          </AppErrorBoundary>
        )}

        {activeFolder === 'notiser' && (
          <>
            <ReminderSettings
              onReminderSettingChange={onReminderSettingChange}
              onRequestNotificationPermission={onRequestNotificationPermission}
              reminderOptions={reminderOptions}
              reminderSettings={reminderSettings}
              reminderStatus={reminderStatus}
            />
            <AppErrorBoundary
              area="reminders"
              resetKey={reminderState.updatedAt}
              title="Påminnelser kunde inte visas"
            >
              <ReminderCenter
                checkIn={checkIn}
                checkIns={healthSnapshot?.checkIn?.dailyEntries}
                goalsHabits={goalsHabits}
                meals={meals}
                onRemindersChange={onReminderStateChange}
                reminderState={reminderState}
                schedulerStatus={schedulerStatus}
                today={selectedMealDate}
                weights={weights}
              />
            </AppErrorBoundary>
            <AppErrorBoundary
              area="notifications"
              resetKey={reminderState.updatedAt}
              title="Notiscenter kunde inte visas"
            >
              <NotificationCenter
                adaptiveCoachFeedback={adaptiveCoachFeedback}
                checkIn={checkIn}
                goalsHabits={goalsHabits}
                healthSnapshot={healthSnapshot}
                meals={meals}
                nutritionGoals={nutritionGoals}
                onReminderStateChange={onReminderStateChange}
                profile={profile}
                reminderState={reminderState}
                syncStatus={syncStatus}
                today={selectedMealDate}
                weights={weights}
              />
            </AppErrorBoundary>
          </>
        )}

        {activeFolder === 'import-export' && DataExportCenter && DataImportCenter && (
          <Suspense fallback={<LazySectionFallback />}>
            <DataImportCenter
              onDataImported={onDataRestored}
              userId={userId}
            />
            <DataExportCenter userId={userId} />
          </Suspense>
        )}

        {activeFolder === 'mal-framsteg' && (
          <MoreGoalsFolder
            goalsHabits={goalsHabits}
            profileCompleteness={profileCompleteness}
          />
        )}

        {activeFolder === 'arkiv-historik' && (
          <AppErrorBoundary
            area="archive"
            resetKey={userId}
            title="Arkiv kunde inte visas"
          >
            <CloudBackupPanel
              isAuthenticated={isAuthenticated}
              onDataRestored={onDataRestored}
              variant="archive"
            />
            {showInternalTools && SyncHealthDashboard && (
              <Suspense fallback={null}>
                <SyncHealthDashboard
                  isAuthenticated={isAuthenticated}
                  onDataChanged={onDataRestored}
                  userId={userId}
                />
              </Suspense>
            )}
          </AppErrorBoundary>
        )}

        {activeFolder === 'installningar' && (
          <article className="panel account-settings-panel" id="installningar">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Konto</p>
                <h2>Profil och konto</h2>
              </div>
            </div>

            <p className="account-email">
              Inloggad som <strong>{email || 'okänd e-post'}</strong>
            </p>

            <div className="app-information">
              <h3>Profilunderlag</h3>
              <p>
                {profile?.displayName || profile?.name || 'Profil utan namn'} · {profile?.weightDirectionLabel || 'Mål saknas'} · {profile?.activityLevelLabel || 'Aktivitet saknas'}
              </p>
              <p>
                {profileCompleteness?.nextBestAction || 'Profilen kan kompletteras när som helst.'}
              </p>
            </div>

            <div className="app-information">
              <h3>Remote bildanalys</h3>
              <p>
                {nutritionRemoteConsent.granted
                  ? `Godkänd för den här användaren sedan ${nutritionRemoteConsent.grantedAt.slice(0, 10)}.`
                  : 'Remote bildanalys är inte godkänd för den här användaren.'}
              </p>
              <button
                className="secondary-button"
                type="button"
                onClick={handleRevokeNutritionRemoteConsent}
                disabled={!nutritionRemoteConsent.granted}
              >
                Återkalla samtycke för bildanalys
              </button>
            </div>

            <div className="app-information">
              <h3>Appinställningar och enheter</h3>
              <p>
                {syncStatus?.currentDevice?.deviceLabel || 'Den här enheten'}
                {syncStatus?.currentDevice?.platform ? ` · ${syncStatus.currentDevice.platform}` : ''}
                {syncStatus?.currentDevice?.browser ? ` · ${syncStatus.currentDevice.browser}` : ''}
                {syncStatus?.currentDevice?.appMode ? ` · ${syncStatus.currentDevice.appMode}` : ''}
              </p>
              <p>
                {syncStatus?.enabled === false
                  ? 'Lokallagring: data sparas bara på den här enheten.'
                  : 'Lokallagring: data sparas här och synkas till molnet när du är inloggad.'}
              </p>
            </div>

            <div className="app-information">
              <h3>Sök i appen</h3>
              <GlobalSearch onNavigate={onSearchNavigate} />
            </div>

            <div className="account-settings-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={onEditProfile}
              >
                Ändra profil
              </button>

              <button
                className="secondary-button account-signout-button"
                type="button"
                onClick={onSignOut}
                disabled={authLoading}
              >
                {authLoading ? 'Loggar ut...' : 'Logga ut'}
              </button>
            </div>

            <div className="app-information">
              <h3>Om Viktkollen</h3>
              <p>
                Viktkollen ger allmänt stöd för hälsa och välmående. Informationen
                är inte medicinsk rådgivning, diagnos eller behandling.
              </p>
            </div>

            <details className="account-danger-zone">
              <summary>Radera konto och data</summary>
              <div className="account-deletion-panel">
                <p>
                  Radering kräver inloggning och serververifiering. Molndata raderas
                  före auth-kontot, och appen loggar ut efter lyckad radering.
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleCheckDeletionReadiness}
                  disabled={authLoading || isDeletingAccount || !isAuthenticated}
                >
                  Kontrollera raderingsstatus
                </button>
                <label>
                  Bekräfta med texten radera konto
                  <input
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    disabled={authLoading || isDeletingAccount || !isAuthenticated}
                  />
                </label>
                <button
                  className="secondary-button account-delete-button"
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={authLoading || isDeletingAccount || !isAuthenticated}
                >
                  {isDeletingAccount ? 'Raderar...' : 'Radera konto'}
                </button>
                {deleteStatus && (
                  <p className="settings-confirmation" role="status">
                    {deleteStatus}
                  </p>
                )}
              </div>
            </details>
          </article>
        )}
      </MoreHub>
    </AppSection>
  )
}

export default MoreSection
