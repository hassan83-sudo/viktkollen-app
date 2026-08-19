import { Suspense, useState } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CloudBackupPanel from '../CloudBackupPanel.jsx'
import CloudStatusPanel from '../CloudStatusPanel.jsx'
import CloudSyncPanel from '../CloudSyncPanel.jsx'
import NotificationCenter from '../NotificationCenter.jsx'
import ReminderCenter from '../ReminderCenter.jsx'
import ReminderSettings from '../ReminderSettings.jsx'
import AppSection from '../app/AppSection.jsx'
import GlobalSearch from '../app/GlobalSearch.jsx'
import LazySectionFallback from '../app/LazySectionFallback.jsx'
import {
  clearLocalViktkollenData,
  requestAccountDeletion,
} from '../../services/accountDeletionClient.js'

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
  nutritionGoals,
  onDataRestored,
  onEditProfile,
  onReminderSettingChange,
  onReminderStateChange,
  onRequestNotificationPermission,
  onSearchNavigate,
  onSignOut,
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
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteStatus, setDeleteStatus] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

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

  return (
    <AppSection
      activeSection={activeSection}
      id="more"
      label="Fler funktioner och inställningar"
    >
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
        {DataExportCenter && DataImportCenter && (
          <Suspense fallback={<LazySectionFallback />}>
            <DataExportCenter userId={userId} />
            <DataImportCenter
              onDataImported={onDataRestored}
              userId={userId}
            />
          </Suspense>
        )}
        {showInternalTools && SyncHealthDashboard && (
          <Suspense fallback={null}>
            <SyncHealthDashboard
              isAuthenticated={isAuthenticated}
              onDataChanged={onDataRestored}
              userId={userId}
            />
          </Suspense>
        )}
        <CloudBackupPanel
          isAuthenticated={isAuthenticated}
          onDataRestored={onDataRestored}
        />
      </AppErrorBoundary>

      <article className="panel account-settings-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Konto</p>
            <h2>Profil och konto</h2>
          </div>
        </div>

        <p className="account-email">
          Inloggad som <strong>{email || 'okänd e-post'}</strong>
        </p>

        <div className="account-settings-actions">
          <GlobalSearch onNavigate={onSearchNavigate} />

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
    </AppSection>
  )
}

export default MoreSection
