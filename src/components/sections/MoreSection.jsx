import { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CloudBackupPanel from '../CloudBackupPanel.jsx'
import CloudStatusPanel from '../CloudStatusPanel.jsx'
import CloudSyncPanel from '../CloudSyncPanel.jsx'
import MoreHub from '../more/MoreHub.jsx'
import LanguageSettingsPanel from '../LanguageSettingsPanel.jsx'
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
  authLoading,
  email,
  healthSnapshot,
  isAuthenticated,
  language,
  navigationIntent,
  onDataRestored,
  onEditProfile,
  onLanguageChange,
  onOpenAiCoach,
  onSearchNavigate,
  onSignOut,
  profileCompleteness,
  DataExportCenterComponent,
  DataImportCenterComponent,
  SyncHealthDashboardComponent,
  showInternalTools = false,
  syncStatus,
  userId,
  profile,
  ProgressSectionComponent,
  progressSectionProps,
  NutritionSectionComponent,
  nutritionSectionProps,
  nutritionNavigationIntent,
  CoachSectionComponent,
  coachSectionProps,
  WellbeingSectionComponent,
  wellbeingSectionProps,
  EconomySectionComponent,
  economySectionProps,
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
      ? t('deletionDryRunOk')
      : result.error?.safeMessage || t('deletionCheckFailed'))
  }

  async function handleDeleteAccount() {
    const confirmPhrase = t('deleteConfirmPhrase')
    if (deleteConfirmation.trim().toLocaleLowerCase('sv-SE') !== confirmPhrase.toLocaleLowerCase('sv-SE')) {
      setDeleteStatus(t('writeExactDeletePhrase', { phrase: confirmPhrase }))
      return
    }

    setIsDeletingAccount(true)
    setDeleteStatus('')
    const result = await requestAccountDeletion({ mode: 'account' })
    setIsDeletingAccount(false)

    if (!result.ok) {
      setDeleteStatus(result.error?.safeMessage || t('deleteFailed'))
      return
    }

    const localResult = clearLocalViktkollenData()
    setDeleteStatus(localResult.ok
      ? t('deleteSuccess')
      : t('deletePartialLocal'))
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
        {activeFolder === 'mat' && (
          <AppErrorBoundary area="nutrition" resetKey={`${healthSnapshot?.date}-${weights.length}`} title={t('nutritionError', { defaultValue: 'Mat kunde inte visas' })}>
            {NutritionSectionComponent && (
              <NutritionSectionComponent
                {...nutritionSectionProps}
                activeSection="nutrition"
                navigationIntent={nutritionNavigationIntent || navigationIntent}
              />
            )}
          </AppErrorBoundary>
        )}

        {activeFolder === 'ai-coach' && (
          <>
          <article className="panel" id="ai-coach">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t('folders.coach.eyebrow', { defaultValue: 'AI' })}</p>
                <h2>{t('folders.coach.title', { defaultValue: 'AI Coach' })}</h2>
              </div>
            </div>
            <p>{t('folders.coach.body', { defaultValue: 'Öppna den fullständiga AI Coach-ytan. Historik och state delas med Hem och Redo!.' })}</p>
            <button className="primary-button" type="button" onClick={() => onOpenAiCoach?.()}>
              {t('folders.coach.open', { defaultValue: 'Öppna AI Coach' })}
            </button>
          </article>
          {CoachSectionComponent && (
            <AppErrorBoundary area="coach" resetKey={userId} title={t('coachError', { defaultValue: 'AI Coach kunde inte visas' })}>
              <CoachSectionComponent
                {...coachSectionProps}
                activeSection="coach"
              />
            </AppErrorBoundary>
          )}
          </>
        )}

        {activeFolder === 'ma-bra' && WellbeingSectionComponent && (
          <AppErrorBoundary area="wellbeing" resetKey={userId} title={t('wellbeingError', { defaultValue: 'Må bra kunde inte visas' })}>
            <WellbeingSectionComponent
              {...wellbeingSectionProps}
              activeSection="wellbeing"
              t={t}
            />
          </AppErrorBoundary>
        )}

        {activeFolder === 'ekonomi' && EconomySectionComponent && (
          <AppErrorBoundary area="economy" resetKey={userId} title={t('economyError', { defaultValue: 'Ekonomi kunde inte visas' })}>
            <EconomySectionComponent
              {...economySectionProps}
              activeSection="economy"
            />
          </AppErrorBoundary>
        )}

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
          <AppErrorBoundary area="progress" resetKey={`${healthSnapshot?.date}-${weights.length}`} title={t('goalsProgressError')}>
            {ProgressSectionComponent && (
              <ProgressSectionComponent
                {...progressSectionProps}
                activeSection="progress"
                navigationIntent={navigationIntent}
              />
            )}
          </AppErrorBoundary>
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
