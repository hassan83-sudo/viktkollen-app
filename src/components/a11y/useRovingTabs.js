import { useRef } from 'react'

// A11Y-8Z1 (8Y A-8Y-N1, B-8Y-N1): keyboard for an ARIA tablist with roving
// tabindex and automatic activation (the app selects a tab on click, so
// selection follows focus). ArrowRight/ArrowLeft move to the next/previous
// tab with wrap, Home/End to the first/last. The selected tab is the only
// Tab stop (tabIndex 0, the others -1).

export function nextTabForKey(tabs, current, key) {
  const index = tabs.indexOf(current)
  if (index === -1 || tabs.length === 0) return null
  if (key === 'ArrowRight') return tabs[(index + 1) % tabs.length]
  if (key === 'ArrowLeft') return tabs[(index - 1 + tabs.length) % tabs.length]
  if (key === 'Home') return tabs[0]
  if (key === 'End') return tabs[tabs.length - 1]
  return null
}

export function useRovingTabs({ activeTab, onSelect, tabs }) {
  const tabElements = useRef(new Map())

  function onKeyDown(event) {
    const next = nextTabForKey(tabs, activeTab, event.key)
    if (!next) return
    event.preventDefault()
    onSelect(next)
    tabElements.current.get(next)?.focus()
  }

  function tabRef(tab) {
    return (element) => {
      if (element) tabElements.current.set(tab, element)
      else tabElements.current.delete(tab)
    }
  }

  return { onKeyDown, tabRef }
}
