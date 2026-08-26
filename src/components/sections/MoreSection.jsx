import { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CloudBackupPanel from '../CloudBackupPanel.jsx'
import CloudStatusPanel from '../CloudStatusPanel.jsx'
import CloudSyncPanel from '../CloudSyncPanel.jsx'
import MoreGoalsFolder from '../more/MoreGoalsFolder.jsx'
import MoreHub from '../more/MoreHub.jsx'
import NotificationCenter from '../NotificationCenter.jsx'
import LanguageSettingsPanel from '../LanguageSettingsPanel.jsx'
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
  language,
  meals,
  navigationIntent,
  nutritionGoals,
  onDataRestored,
  onEditProfile,
  onReminderSettingChange,
  onReminderStateChange,
  onRequestNotificationPermission,
  onLanguageChange,
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
  const { t } = useTranslation(['settings', 'common'])
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
    if (!folder) return

    const timer = window.setTimeout(() => {
      setActiveFolder(folder)
    }, 0)

    return () => window.clearTimeout(timer)
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
      label={t('sectionLabel')}
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
            title={t('cloudError')}
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
              title={t('remindersError')}
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
              title={t('notificationsError')}
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
            title={t('archiveError')}
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
                <p className="eyebrow">{t('accountEyebrow')}</p>
                <h2>{t('accountTitle')}</h2>
              </div>
            </div>

            <p className="account-email">
              {t('signedInAs')} <strong>{email || t('unknownEmail')}</strong>
            </p>

            <div className="app-information">
              <h3>{t('profileBasis')}</h3>
              <p>
                {profile?.displayName || profile?.name || t('unnamedProfile')} · {profile?.weightDirectionLabel || t('goalMissing')} · {profile?.activityLevelLabel || t('activityMissing')}
              </p>
              <p>
                {profileCompleteness?.nextBestAction || t('profileAnytime')}
              </p>
            </div>

            <div className="app-information">
              <h3>{t('remoteImageAnalysis')}</h3>
              <p>
                {nutritionRemoteConsent.granted
                  ? t('remoteGrantedSince', { date: nutritionRemoteConsent.grantedAt.slice(0, 10) })
                  : t('remoteNotGranted')}
              </p>
              <button
                className="secondary-button"
                type="button"
                onClick={handleRevokeNutritionRemoteConsent}
                disabled={!nutritionRemoteConsent.granted}
              >
                {t('revokeConsent')}
              </button>
            </div>

            <div className="app-information">
              <LanguageSettingsPanel
                language={language}
                onLanguageChange={onLanguageChange}
              />
            </div>

            <div className="app-information">
              <h3>{t('appSettingsDevices')}</h3>
              <p>
                {syncStatus?.currentDevice?.deviceLabel || t('thisDevice')}
                {syncStatus?.currentDevice?.platform ? ` · ${syncStatus.currentDevice.platform}` : ''}
                {syncStatus?.currentDevice?.browser ? ` · ${syncStatus.currentDevice.browser}` : ''}
                {syncStatus?.currentDevice?.appMode ? ` · ${syncStatus.currentDevice.appMode}` : ''}
              </p>
              <p>
                {syncStatus?.enabled === false
                  ? t('localOnly')
                  : t('localAndCloud')}
              </p>
            </div>

            <div className="app-information">
              <h3>{t('searchInApp')}</h3>
              <GlobalSearch onNavigate={onSearchNavigate} />
            </div>

            <div className="account-settings-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={onEditProfile}
              >
                {t('editProfile')}
              </button>

              <button
                className="secondary-button account-signout-button"
                type="button"
                onClick={onSignOut}
                disabled={authLoading}
              >
                {authLoading ? t('common:loggingOut') : t('common:actions.signOut')}
              </button>
            </div>

            <div className="app-information">
              <h3>{t('aboutTitle')}</h3>
              <p>
                {t('aboutBody')}
              </p>
            </div>

            <details className="account-danger-zone">
              <summary>{t('deleteAccountData')}</summary>
              <div className="account-deletion-panel">
                <p>
                  {t('deleteAccountHelp')}
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleCheckDeletionReadiness}
                  disabled={authLoading || isDeletingAccount || !isAuthenticated}
                >
                  {t('checkDeletionStatus')}
                </button>
                <label>
                  {t('confirmDeleteLabel')}
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
                  {isDeletingAccount ? t('deleting') : t('deleteAccount')}
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
