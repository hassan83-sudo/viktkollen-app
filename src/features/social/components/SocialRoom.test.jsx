/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

import SocialRoom from './SocialRoom.jsx'
import { canLoadSocialRoomData } from '../model/socialRoomPolicy.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted = []
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

function renderRoom(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(<SocialRoom enabled {...props} />)
  })
  mounted.push({ container, root })
  return container
}

afterEach(() => {
  mounted.splice(0).forEach(({ container, root }) => {
    act(() => root.unmount())
    container.remove()
  })
})

describe('SocialRoom', () => {
  it('hides entirely when social UI is disabled', () => {
    expect(renderToStaticMarkup(<SocialRoom enabled={false} />)).toBe('')
  })

  it('keeps six navigation items within the mobile viewport', () => {
    expect(appCss).toContain('repeat(var(--bottom-nav-count, 5), minmax(0, 1fr))')
    expect(appCss).toContain('width: calc(100% - 8px)')
    expect(appCss).toMatch(/@media \(max-width: 430px\) \{[\s\S]*?\.social-room-grid \{\s*grid-template-columns: 1fr;/)
  })

  it('keeps social reads and subscriptions unavailable while live data is off', () => {
    expect(canLoadSocialRoomData({
      enabled: true,
      isAuthenticated: true,
      liveEnabled: false,
      supabaseConfigured: true,
    })).toBe(false)

    const markup = renderToStaticMarkup(<SocialRoom enabled isAuthenticated liveEnabled={false} />)
    expect(markup).toContain('No verified friend is online right now.')
    expect(markup).toContain('No approved local audio files are available.')
    expect(markup).not.toContain('<audio')
    expect(markup).not.toContain('Anna')
  })

  it('switches internal views and retains local player preferences without autoplay', () => {
    const container = renderRoom({ isAuthenticated: true, liveEnabled: false })
    const chatTab = container.querySelector('#social-room-tab-chat')
    const ocean = [...container.querySelectorAll('.social-room-player-options button')]
      .find((button) => button.textContent === 'Ocean')
    const timer = [...container.querySelectorAll('.social-room-player-timers button')]
      .find((button) => button.textContent === '30 minutes')
    const volume = container.querySelector('input[type="range"]')
    const play = container.querySelector('[aria-label="Play selected soundscape"]')

    expect(play.disabled).toBe(true)
    act(() => chatTab.click())
    act(() => ocean.click())
    act(() => timer.click())
    act(() => {
      volume.value = '70'
      volume.dispatchEvent(new Event('input', { bubbles: true }))
      volume.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.textContent).toContain('Friend chat')
    expect(ocean.getAttribute('aria-pressed')).toBe('true')
    expect(timer.getAttribute('aria-pressed')).toBe('true')
    expect(volume.value).toBe('70')
  })
})
