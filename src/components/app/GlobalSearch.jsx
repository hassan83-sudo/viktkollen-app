import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getDefaultGlobalSearchGroups,
  getGlobalSearchKeyboardAction,
  getGlobalSearchItemsById,
  getVisibleGlobalSearchItems,
  isGlobalSearchOpenShortcut,
  searchGlobalNavigation,
} from '../../services/navigation/globalSearchIndex.js'
import { getFeatureFlags } from '../../features/featureRegistry.js'
import {
  GLOBAL_SEARCH_OPEN_EVENT,
  GLOBAL_SEARCH_VOICE_START_EVENT,
  GLOBAL_SEARCH_VOICE_STATUS_EVENT,
  isEditableSearchShortcutTarget,
  publishGlobalSearchVoiceStatus,
  requestOpenGlobalSearch,
  requestStartGlobalSearchVoice,
} from '../../services/navigation/globalSearchEvents.js'
import {
  getSpeechRecognitionConstructor,
  isFinalSpeechResult,
  mapSpeechRecognitionError,
  pickSpeechTranscript,
  resolveSpeechRecognitionLanguage,
} from '../../services/navigation/globalSearchVoice.js'

const recentSearchStorageKey = 'viktkollen.globalSearch.recentIds'
/** Internal group title from globalSearchIndex until that corpus is migrated. */
const RECENT_GROUP_TITLE = 'Senast använda'

const searchGroupTitleKeys = {
  Populärt: 'search.groups.popular',
  Snabbåtgärder: 'search.groups.quickActions',
  'Förslag för dig': 'search.groups.suggestions',
  'Senast använda': 'search.groups.recent',
}

const idleVoiceStatus = { message: '', phase: 'idle' }

function readRecentSearchIds() {
  if (typeof window === 'undefined') return []

  try {
    const value = window.localStorage?.getItem(recentSearchStorageKey)
    const parsed = JSON.parse(value || '[]')

    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function saveRecentSearchId(id) {
  if (typeof window === 'undefined' || !id) return

  try {
    const nextIds = [id, ...readRecentSearchIds().filter((recentId) => recentId !== id)].slice(0, 6)
    window.localStorage?.setItem(recentSearchStorageKey, JSON.stringify(nextIds))
  } catch {
    // Search remains fully usable even when storage is unavailable.
  }
}

function GlobalSearch({
  listenForShortcut = false,
  onNavigate,
  showTrigger = true,
}) {
  const { t, i18n } = useTranslation(['settings', 'common'])
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState(idleVoiceStatus)
  const inputRef = useRef(null)
  const openerRef = useRef(null)
  const previousFocusRef = useRef(null)
  const recognitionRef = useRef(null)
  const voiceSessionRef = useRef(0)
  const ignoreAbortRef = useRef(false)
  const [recentIds, setRecentIds] = useState(() => readRecentSearchIds())
  const hostDialog = listenForShortcut
  const flags = getFeatureFlags()
  const catalog = useMemo(() => getVisibleGlobalSearchItems(flags), [flags])
  const results = useMemo(() => searchGlobalNavigation(query, catalog), [catalog, query])
  const defaultGroups = useMemo(() => {
    const groups = getDefaultGlobalSearchGroups(catalog)
    const recentItems = getGlobalSearchItemsById(recentIds, catalog)

    if (recentItems.length === 0) return groups

    return [
      ...groups.filter((group) => group.title !== RECENT_GROUP_TITLE),
      { items: recentItems, title: RECENT_GROUP_TITLE },
    ]
  }, [catalog, recentIds])
  const defaultResults = useMemo(() => defaultGroups.flatMap((group) => group.items), [defaultGroups])
  const hasQuery = query.trim().length > 0
  const hasTypedResults = results.length > 0
  const visibleResults = hasQuery ? results : defaultResults
  const fallbackResults = useMemo(() => searchGlobalNavigation('hem', catalog).slice(0, 4), [catalog])
  const navigationResults = visibleResults.length > 0 ? visibleResults : hasQuery ? fallbackResults : []
  const hasResults = navigationResults.length > 0
  const isListening = voiceStatus.phase === 'listening'

  const translateGroupTitle = (title) => {
    const key = searchGroupTitleKeys[title]
    return key ? t(key) : title
  }

  const updateVoiceStatus = useCallback((nextStatus) => {
    setVoiceStatus(nextStatus)
    publishGlobalSearchVoiceStatus(nextStatus)
  }, [])

  const openSearch = useCallback(() => {
    setIsOpen((alreadyOpen) => {
      if (!alreadyOpen) {
        previousFocusRef.current = document.activeElement
      }
      return true
    })
  }, [])

  const stopRecognition = useCallback((publishStopped = false) => {
    voiceSessionRef.current += 1
    ignoreAbortRef.current = true
    const active = recognitionRef.current
    recognitionRef.current = null
    try {
      active?.abort?.()
    } catch {
      try {
        active?.stop?.()
      } catch {
        // Browser implementations may throw if recognition is already ending.
      }
    }
    ignoreAbortRef.current = false
    if (publishStopped) {
      updateVoiceStatus({ message: t('search.stopped'), phase: 'stopped' })
    }
  }, [t, updateVoiceStatus])

  const closeSearch = useCallback(() => {
    stopRecognition(false)
    updateVoiceStatus(idleVoiceStatus)
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
    window.requestAnimationFrame(() => {
      const focusTarget = openerRef.current || previousFocusRef.current
      focusTarget?.focus?.()
    })
  }, [stopRecognition, updateVoiceStatus])

  function navigateToResult(result) {
    if (!result) return
    saveRecentSearchId(result.id)
    setRecentIds(readRecentSearchIds())
    onNavigate?.(result)
    closeSearch()
  }

  const startVoiceSearch = useCallback(() => {
    openSearch()
    if (recognitionRef.current) {
      stopRecognition(true)
      return
    }

    const Recognition = getSpeechRecognitionConstructor(window)
    if (!Recognition) {
      updateVoiceStatus({ message: t('search.unsupported'), phase: 'unsupported' })
      return
    }

    const sessionId = voiceSessionRef.current + 1
    voiceSessionRef.current = sessionId
    const recognition = new Recognition()
    recognition.lang = resolveSpeechRecognitionLanguage(i18n.language)
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      if (voiceSessionRef.current !== sessionId) return
      updateVoiceStatus({ message: t('search.listening'), phase: 'listening' })
    }

    recognition.onresult = (event) => {
      if (voiceSessionRef.current !== sessionId) return
      const transcript = pickSpeechTranscript(event)
      if (!transcript) return
      if (!isFinalSpeechResult(event)) {
        updateVoiceStatus({ message: t('search.processing'), phase: 'processing' })
        return
      }
      setQuery(transcript)
      setSelectedIndex(0)
      updateVoiceStatus(idleVoiceStatus)
    }

    recognition.onerror = (event) => {
      if (voiceSessionRef.current !== sessionId) return
      const mapped = mapSpeechRecognitionError(event?.error)
      if (mapped === 'aborted') {
        if (!ignoreAbortRef.current) {
          updateVoiceStatus({ message: t('search.stopped'), phase: 'stopped' })
        }
        return
      }
      const messages = {
        permission: t('search.permissionDenied'),
        noSpeech: t('search.noSpeech'),
        audioCapture: t('search.audioCapture'),
        network: t('search.network'),
        generic: t('search.genericError'),
      }
      updateVoiceStatus({ message: messages[mapped] || t('search.genericError'), phase: 'error' })
    }

    recognition.onend = () => {
      if (voiceSessionRef.current !== sessionId) return
      recognitionRef.current = null
      setVoiceStatus((current) => (current.phase === 'listening' || current.phase === 'processing' ? idleVoiceStatus : current))
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      updateVoiceStatus({ message: t('search.genericError'), phase: 'error' })
    }
  }, [i18n.language, openSearch, stopRecognition, t, updateVoiceStatus])

  useEffect(() => {
    if (!listenForShortcut) return undefined

    function handleGlobalKeyDown(event) {
      if (!isGlobalSearchOpenShortcut(event)) return
      if (isOpen) {
        event.preventDefault()
        return
      }
      if (isEditableSearchShortcutTarget(event.target)) return
      event.preventDefault()
      openSearch()
    }

    function handleOpenEvent() {
      openSearch()
    }

    function handleVoiceStart() {
      startVoiceSearch()
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    window.addEventListener(GLOBAL_SEARCH_OPEN_EVENT, handleOpenEvent)
    window.addEventListener(GLOBAL_SEARCH_VOICE_START_EVENT, handleVoiceStart)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
      window.removeEventListener(GLOBAL_SEARCH_OPEN_EVENT, handleOpenEvent)
      window.removeEventListener(GLOBAL_SEARCH_VOICE_START_EVENT, handleVoiceStart)
    }
  }, [isOpen, listenForShortcut, openSearch, startVoiceSearch])

  useEffect(() => {
    if (listenForShortcut) return undefined

    function handleVoiceStatus(event) {
      const detail = event.detail
      if (!detail || typeof detail !== 'object') return
      setVoiceStatus({
        message: typeof detail.message === 'string' ? detail.message : '',
        phase: detail.phase || 'idle',
      })
    }

    window.addEventListener(GLOBAL_SEARCH_VOICE_STATUS_EVENT, handleVoiceStatus)
    return () => window.removeEventListener(GLOBAL_SEARCH_VOICE_STATUS_EVENT, handleVoiceStatus)
  }, [listenForShortcut])

  useEffect(() => {
    if (!isOpen) return
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [isOpen])

  useEffect(() => () => {
    voiceSessionRef.current += 1
    try {
      recognitionRef.current?.abort?.()
    } catch {
      // Unmount must not throw if the browser already ended recognition.
    }
    recognitionRef.current = null
  }, [])

  function handleInputKeyDown(event) {
    const action = getGlobalSearchKeyboardAction(event, selectedIndex, navigationResults.length)

    if (action.type === 'none') {
      return
    }

    event.preventDefault()

    if (action.type === 'close') {
      closeSearch()
      return
    }

    if (action.type === 'select') {
      setSelectedIndex(action.index)
      return
    }

    navigateToResult(navigationResults[action.index])
  }

  function renderResult(result, index) {
    return (
      <button
        aria-selected={index === selectedIndex}
        className={index === selectedIndex ? 'is-selected' : ''}
        id={`global-search-result-${result.id}`}
        key={result.id}
        role="option"
        type="button"
        onClick={() => navigateToResult(result)}
        onMouseEnter={() => setSelectedIndex(index)}
      >
        <span aria-hidden="true">{result.icon}</span>
        <span>
          <strong>{t(`search.items.${result.id}.title`, { defaultValue: result.title })}</strong>
          <small>{t(`search.items.${result.id}.description`, { defaultValue: result.description })}</small>
        </span>
      </button>
    )
  }

  function handleTriggerClick() {
    if (listenForShortcut) {
      openSearch()
      return
    }
    requestOpenGlobalSearch()
  }

  function handleVoiceClick() {
    if (listenForShortcut) {
      startVoiceSearch()
      return
    }
    requestStartGlobalSearchVoice()
  }

  function renderVoiceButton(extraClass = '') {
    return (
      <button
        aria-label={t('search.voiceSearch')}
        aria-pressed={isListening}
        className={`global-search-voice secondary-button ${extraClass}`.trim()}
        type="button"
        onClick={handleVoiceClick}
      >
        <span aria-hidden="true">{isListening ? '■' : '🎤'}</span>
      </button>
    )
  }

  return (
    <>
      {showTrigger && (
        <div className="global-search-entry">
          <button
            className="global-search-trigger secondary-button"
            type="button"
            onClick={handleTriggerClick}
            ref={openerRef}
            aria-label={t('search.open')}
          >
            <span aria-hidden="true">⌕</span>
            <strong>{t('common:search')}</strong>
            <kbd>Ctrl K</kbd>
          </button>
          {renderVoiceButton()}
        </div>
      )}

      {hostDialog && isOpen && (
        <div className="global-search-backdrop" role="presentation">
          <div
            aria-label={t('search.dialog')}
            aria-modal="true"
            className="global-search-dialog"
            role="dialog"
          >
            <div className="global-search-field">
              <span aria-hidden="true">⌕</span>
              <input
                aria-activedescendant={
                  hasResults && selectedIndex >= 0 ? `global-search-result-${navigationResults[selectedIndex]?.id}` : undefined
                }
                aria-controls="global-search-results"
                aria-label={t('search.input')}
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={handleInputKeyDown}
                placeholder={t('search.placeholder')}
                ref={inputRef}
                role="searchbox"
                type="search"
                value={query}
              />
              {renderVoiceButton('is-in-dialog')}
              {isListening ? (
                <button className="secondary-button" type="button" onClick={() => stopRecognition(true)}>
                  {t('common:actions.cancel')}
                </button>
              ) : (
                <button className="secondary-button" type="button" onClick={closeSearch}>
                  {t('common:actions.close')}
                </button>
              )}
            </div>
            {voiceStatus.message ? (
              <p className="global-search-voice-status is-in-dialog" aria-live="polite">
                {voiceStatus.message}
              </p>
            ) : null}

            <div
              className="global-search-results"
              id="global-search-results"
              role="listbox"
              aria-label={t('search.results')}
            >
              {!hasQuery && defaultGroups.map((group) => {
                let startIndex = 0
                for (const previousGroup of defaultGroups) {
                  if (previousGroup.title === group.title) break
                  startIndex += previousGroup.items.length
                }
                const groupTitle = translateGroupTitle(group.title)

                return (
                  <section className="global-search-group" key={group.title} aria-label={groupTitle}>
                    <h3>{groupTitle}</h3>
                    {group.items.map((result, index) => renderResult(result, startIndex + index))}
                  </section>
                )
              })}

              {hasQuery && hasTypedResults && results.map((result, index) => renderResult(result, index))}

              {hasQuery && !hasTypedResults && (
                <div className="global-search-empty">
                  <p>{t('search.noExactMatches', { query })}</p>
                  <div className="global-search-related">
                    {fallbackResults.map((result, index) => renderResult(result, index))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default GlobalSearch
