import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ModalDialog from '../a11y/ModalDialog.jsx'
import {
  getDefaultGlobalSearchGroups,
  getGlobalSearchKeyboardAction,
  getGlobalSearchItemsById,
  isGlobalSearchOpenShortcut,
  searchGlobalNavigation,
} from '../../services/navigation/globalSearchIndex.js'

const recentSearchStorageKey = 'viktkollen.globalSearch.recentIds'
/** Internal group title from globalSearchIndex until that corpus is migrated. */
const RECENT_GROUP_TITLE = 'Senast använda'

const searchGroupTitleKeys = {
  Populärt: 'search.groups.popular',
  Snabbåtgärder: 'search.groups.quickActions',
  'Förslag för dig': 'search.groups.suggestions',
  'Senast använda': 'search.groups.recent',
}

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

function GlobalSearch({ onNavigate }) {
  const { t } = useTranslation(['settings', 'common'])
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  // A11Y-8W (8M B4): combobox with a listbox popup. DOM focus stays in the
  // field; the arrow keys move the active option (aria-activedescendant).
  // -1 means no active option.
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef(null)
  const openerRef = useRef(null)
  const [recentIds, setRecentIds] = useState(() => readRecentSearchIds())
  const results = useMemo(() => searchGlobalNavigation(query), [query])
  const defaultGroups = useMemo(() => {
    const groups = getDefaultGlobalSearchGroups()
    const recentItems = getGlobalSearchItemsById(recentIds)

    if (recentItems.length === 0) return groups

    return [
      ...groups.filter((group) => group.title !== RECENT_GROUP_TITLE),
      { items: recentItems, title: RECENT_GROUP_TITLE },
    ]
  }, [recentIds])
  const defaultResults = useMemo(() => defaultGroups.flatMap((group) => group.items), [defaultGroups])
  const hasQuery = query.trim().length > 0
  const hasTypedResults = results.length > 0
  const visibleResults = hasQuery ? results : defaultResults
  const fallbackResults = useMemo(() => searchGlobalNavigation('hem').slice(0, 4), [])
  const navigationResults = visibleResults.length > 0 ? visibleResults : hasQuery ? fallbackResults : []
  const hasResults = navigationResults.length > 0
  const activeResult = selectedIndex >= 0 ? navigationResults[selectedIndex] : null
  const resultStatus = !hasQuery
    ? ''
    : hasTypedResults
      ? t('search.resultCount', { count: results.length })
      : t('search.noExactMatches', { query })

  const translateGroupTitle = (title) => {
    const key = searchGroupTitleKeys[title]
    return key ? t(key) : title
  }

  const openSearch = useCallback(() => {
    setIsOpen(true)
  }, [])

  // A11Y-8I: focus handling (initial focus in the search field, trap, inert
  // background, Escape from anywhere in the dialog, and return to the
  // opener) is done by the shared 8C dialog system (ModalDialog).
  const closeSearch = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(-1)
  }, [])

  function navigateToResult(result) {
    if (!result) return
    saveRecentSearchId(result.id)
    setRecentIds(readRecentSearchIds())
    onNavigate?.(result)
    closeSearch()
  }

  // The active option is not focused, so keep it in view when the arrow keys
  // move it through the scrolling list.
  useEffect(() => {
    if (!isOpen || !activeResult) return
    document.getElementById(`global-search-result-${activeResult.id}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeResult, isOpen])

  useEffect(() => {
    function handleGlobalKeyDown(event) {
      if (!isGlobalSearchOpenShortcut(event)) return
      event.preventDefault()
      openSearch()
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [openSearch])

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

    // Enter without an active option opens the first match of a typed search.
    navigateToResult(activeResult || (hasQuery ? navigationResults[0] : null))
  }

  function renderResult(result, index) {
    return (
      <button
        aria-selected={index === selectedIndex}
        className={index === selectedIndex ? 'is-selected' : ''}
        id={`global-search-result-${result.id}`}
        key={result.id}
        role="option"
        tabIndex={-1}
        type="button"
        onClick={() => navigateToResult(result)}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setSelectedIndex(index)}
      >
        <span aria-hidden="true">{result.icon}</span>
        <span>
          <strong>{result.title}</strong>
          <small>{result.description}</small>
        </span>
      </button>
    )
  }

  return (
    <>
      <button
        className="global-search-trigger secondary-button"
        type="button"
        onClick={openSearch}
        ref={openerRef}
        aria-label={t('search.open')}
      >
        <span aria-hidden="true">⌕</span>
        <strong>{t('common:search')}</strong>
        <kbd>Ctrl K</kbd>
      </button>

      {isOpen && (
        <div className="global-search-backdrop" role="presentation">
          <ModalDialog
            aria-label={t('search.dialog')}
            className="global-search-dialog"
            closeOnEscape
            initialFocusRef={inputRef}
            onClose={closeSearch}
          >
            <div className="global-search-field">
              <span aria-hidden="true">⌕</span>
              <input
                aria-activedescendant={activeResult ? `global-search-result-${activeResult.id}` : undefined}
                aria-autocomplete="list"
                aria-controls="global-search-results"
                aria-expanded={hasResults}
                aria-label={t('search.input')}
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedIndex(-1)
                }}
                onKeyDown={handleInputKeyDown}
                placeholder={t('search.placeholder')}
                ref={inputRef}
                role="combobox"
                type="search"
                value={query}
              />
              <button className="secondary-button" type="button" onClick={closeSearch}>
                {t('common:actions.close')}
              </button>
            </div>

            <p className="sr-only" id="global-search-status" role="status">{resultStatus}</p>

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
                const groupTitleId = `global-search-group-${startIndex}`

                return (
                  <div className="global-search-group" key={group.title} role="group" aria-labelledby={groupTitleId}>
                    <h3 id={groupTitleId} role="presentation">{groupTitle}</h3>
                    {group.items.map((result, index) => renderResult(result, startIndex + index))}
                  </div>
                )
              })}

              {hasQuery && hasTypedResults && results.map((result, index) => renderResult(result, index))}

              {hasQuery && !hasTypedResults && (
                <div className="global-search-empty" role="group" aria-labelledby="global-search-empty-title">
                  <p id="global-search-empty-title">{t('search.noExactMatches', { query })}</p>
                  <div className="global-search-related">
                    {fallbackResults.map((result, index) => renderResult(result, index))}
                  </div>
                </div>
              )}
            </div>
          </ModalDialog>
        </div>
      )}
    </>
  )
}

export default GlobalSearch
