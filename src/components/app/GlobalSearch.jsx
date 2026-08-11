import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getGlobalSearchKeyboardAction,
  isGlobalSearchOpenShortcut,
  searchGlobalNavigation,
} from '../../services/navigation/globalSearchIndex.js'

const emptySuggestions = ['AI Coach', 'Body Scan', 'Måltider']

function GlobalSearch({ onNavigate }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const openerRef = useRef(null)
  const previousFocusRef = useRef(null)
  const results = useMemo(() => searchGlobalNavigation(query), [query])
  const hasQuery = query.trim().length > 0
  const hasResults = results.length > 0

  const openSearch = useCallback(() => {
    previousFocusRef.current = document.activeElement
    setIsOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
    window.requestAnimationFrame(() => {
      const focusTarget = previousFocusRef.current || openerRef.current
      focusTarget?.focus?.()
    })
  }, [])

  function navigateToResult(result) {
    if (!result) return
    onNavigate?.(result)
    closeSearch()
  }

  useEffect(() => {
    function handleGlobalKeyDown(event) {
      if (!isGlobalSearchOpenShortcut(event)) return
      event.preventDefault()
      openSearch()
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [openSearch])

  useEffect(() => {
    if (!isOpen) return
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [isOpen])

  function handleInputKeyDown(event) {
    const action = getGlobalSearchKeyboardAction(event, selectedIndex, results.length)

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

    navigateToResult(results[action.index])
  }

  return (
    <>
      <button
        className="global-search-trigger secondary-button"
        type="button"
        onClick={openSearch}
        ref={openerRef}
        aria-label="Öppna global sökning"
      >
        <span aria-hidden="true">⌕</span>
        <strong>Sök</strong>
        <kbd>Ctrl K</kbd>
      </button>

      {isOpen && (
        <div className="global-search-backdrop" role="presentation">
          <div
            aria-label="Global sökning"
            aria-modal="true"
            className="global-search-dialog"
            role="dialog"
          >
            <div className="global-search-field">
              <span aria-hidden="true">⌕</span>
              <input
                aria-activedescendant={
                  hasResults && selectedIndex >= 0 ? `global-search-result-${results[selectedIndex]?.id}` : undefined
                }
                aria-controls="global-search-results"
                aria-label="Sök i Viktkollen"
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Sök i Viktkollen..."
                ref={inputRef}
                role="searchbox"
                type="search"
                value={query}
              />
              <button className="secondary-button" type="button" onClick={closeSearch}>
                Stäng
              </button>
            </div>

            <div
              className="global-search-results"
              id="global-search-results"
              role="listbox"
              aria-label="Sökresultat"
            >
              {hasResults && results.map((result, index) => (
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
                    <strong>{result.title}</strong>
                    <small>{result.description}</small>
                  </span>
                </button>
              ))}

              {hasQuery && !hasResults && (
                <div className="global-search-empty">
                  <p>Inga funktioner hittades för "{query}".</p>
                  <div>
                    {emptySuggestions.map((suggestion) => (
                      <button
                        className="secondary-button"
                        key={suggestion}
                        type="button"
                        onClick={() => setQuery(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!hasQuery && (
                <div className="global-search-empty">
                  <p>Sök efter funktioner, till exempel AI Coach, Body Scan eller Måltider.</p>
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
