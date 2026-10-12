/* @vitest-environment jsdom */
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import OverviewDashboard from './OverviewDashboard.jsx'
import {
  BOTTOM_NAV_CLEARANCE_PX,
  SCROLL_IDLE_MS,
  bottomNavOverlap,
  useKeepAboveBottomNav,
} from './keepAboveBottomNav.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const nav = { bottom: 835, height: 72, top: 763 }
const rect = (top, height = 44) => ({ bottom: top + height, height, top })

describe('bottomNavOverlap', () => {
  it('lifts a button that is partly hidden behind the bottom navigation', () => {
    // Uppmätt på iPhone-bredd: knappen 753–797, menyn börjar på 763.
    expect(bottomNavOverlap(rect(753), nav)).toBe(797 - 763 + BOTTOM_NAV_CLEARANCE_PX)
    expect(bottomNavOverlap(rect(733), nav)).toBe(777 - 763 + BOTTOM_NAV_CLEARANCE_PX)
  })

  it('also keeps a small clearance when the button touches the navigation edge', () => {
    expect(bottomNavOverlap(rect(712), nav)).toBe(756 - 763 + BOTTOM_NAV_CLEARANCE_PX)
  })

  it('does nothing when the button is fully visible, fully hidden, or no navigation is shown', () => {
    expect(bottomNavOverlap(rect(600), nav)).toBe(0)
    expect(bottomNavOverlap(rect(780), nav)).toBe(0)
    expect(bottomNavOverlap(rect(753), { bottom: 0, height: 0, top: 0 })).toBe(0)
    expect(bottomNavOverlap(rect(753), null)).toBe(0)
  })

  it('never pushes the button above the top of the screen', () => {
    expect(bottomNavOverlap({ bottom: 800, height: 790, top: 10 }, nav)).toBe(0)
  })
})

describe('useKeepAboveBottomNav', () => {
  let container
  let root
  let navElement
  let buttonTop

  function Probe() {
    const ref = useRef(null)
    useKeepAboveBottomNav(ref)
    return <button ref={ref} type="button">Starta scanning</button>
  }

  beforeEach(() => {
    vi.useFakeTimers()
    navElement = document.createElement('nav')
    navElement.className = 'bottom-nav'
    navElement.getBoundingClientRect = () => nav
    document.body.append(navElement)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    window.scrollBy = vi.fn()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    navElement.remove()
    vi.useRealTimers()
  })

  async function renderWithButtonAt(top) {
    buttonTop = top
    await act(async () => root.render(<Probe />))
    container.querySelector('button').getBoundingClientRect = () => rect(buttonTop)
  }

  it('scrolls the button fully above the navigation once scrolling stops', async () => {
    await renderWithButtonAt(753)

    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('scroll'))
    expect(window.scrollBy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SCROLL_IDLE_MS)

    expect(window.scrollBy).toHaveBeenCalledTimes(1)
    expect(window.scrollBy.mock.calls[0][0]).toMatchObject({ top: 797 - 763 + BOTTOM_NAV_CLEARANCE_PX })
  })

  it('leaves the page alone when the button is not partly covered', async () => {
    await renderWithButtonAt(500)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(SCROLL_IDLE_MS)
    expect(window.scrollBy).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', async () => {
    await renderWithButtonAt(753)
    act(() => root.unmount())
    root = createRoot(container)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(SCROLL_IDLE_MS)
    expect(window.scrollBy).not.toHaveBeenCalled()
  })
})

describe('Home body scan card', () => {
  it('opens the body scan from "Starta scanning" and keeps that button clear of the bottom navigation', async () => {
    vi.useFakeTimers()
    const navElement = document.createElement('nav')
    navElement.className = 'bottom-nav'
    navElement.getBoundingClientRect = () => nav
    document.body.append(navElement)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    window.scrollBy = vi.fn()

    await act(async () => root.render(<OverviewDashboard />))
    const footer = container.querySelector('.overview-body-scan-original-size .overview-primary-action-footer')
    expect(footer).not.toBeNull()

    // Knappen ligger delvis bakom menyn: sidan justeras när scrollningen stannar.
    footer.getBoundingClientRect = () => rect(753)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(SCROLL_IDLE_MS)
    expect(window.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: 797 - 763 + BOTTOM_NAV_CLEARANCE_PX }))

    // Trycket på knappen öppnar kroppsscanningen och inget annat.
    await act(async () => footer.click())
    expect(document.querySelector('.overview-body-scan-stage')).not.toBeNull()

    act(() => root.unmount())
    container.remove()
    navElement.remove()
    vi.useRealTimers()
  })
})
