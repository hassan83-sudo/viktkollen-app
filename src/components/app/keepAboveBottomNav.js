import { useEffect } from 'react'

// Den flytande bottenmenyn (.bottom-nav) ligger ovanpå sidans innehåll. När en
// knapp stannar delvis bakom menyn träffar tryck på den dolda delen menyn i
// stället, på Hem oftast länken "Hem". Efter att scrollningen stannat flyttas
// sidan därför upp precis så mycket att knappen syns helt ovanför menyn.

export const BOTTOM_NAV_CLEARANCE_PX = 12
export const SCROLL_IDLE_MS = 140

/**
 * Hur många pixlar sidan ska scrollas för att målet ska hamna helt ovanför menyn.
 * Bara när målet syns delvis ovanför menyn och samtidigt når in under den.
 * @returns {number} 0 när ingen justering behövs eller är möjlig.
 */
export function bottomNavOverlap(targetRect, navRect, clearance = BOTTOM_NAV_CLEARANCE_PX) {
  if (!targetRect || !navRect || !(navRect.height > 0) || !(targetRect.height > 0)) return 0
  const partlyVisibleAbove = targetRect.top < navRect.top
  const reachesUnderNav = targetRect.bottom > navRect.top - clearance
  if (!partlyVisibleAbove || !reachesUnderNav) return 0
  const delta = Math.ceil(targetRect.bottom - navRect.top + clearance)
  // Flytta aldrig målet ovanför skärmens överkant.
  if (targetRect.top - delta < 0) return 0
  return delta
}

export function useKeepAboveBottomNav(targetRef) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let timer = null

    function adjust() {
      timer = null
      const target = targetRef.current
      const nav = document.querySelector('.bottom-nav')
      if (!target || !nav) return
      const delta = bottomNavOverlap(target.getBoundingClientRect(), nav.getBoundingClientRect())
      if (!delta) return
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      window.scrollBy({ behavior: reduceMotion ? 'auto' : 'smooth', top: delta })
    }

    function onScroll() {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(adjust, SCROLL_IDLE_MS)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (timer) window.clearTimeout(timer)
    }
  }, [targetRef])
}
