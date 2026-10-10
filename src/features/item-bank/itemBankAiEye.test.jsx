/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom')
  return { ...actual, createPortal: (node) => node }
})

import SmartCameraStage from '../smart-camera/components/SmartCameraStage.jsx'
import { getFeatureFlags } from '../featureRegistry.js'
import { getSmartCameraHubModes } from '../smart-camera/smartCameraModes.js'
import { loadMemoryState } from '../memory/memoryStore.js'
import { setActiveUserDataScope } from '../../services/userDataRepository.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Sakbank i AI-Ögat (Smart kamera)', () => {
  let container
  let root
  let getUserMedia
  let fetchSpy

  beforeEach(() => {
    window.localStorage.clear()
    setActiveUserDataScope({ kind: 'authenticated', userId: 'eye-user' })
    getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('no network')))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    fetchSpy.mockRestore()
    setActiveUserDataScope({})
  })

  function click(text) {
    const button = [...container.querySelectorAll('button')].find((node) => node.textContent.includes(text))
    if (!button) throw new Error(`Button not found: ${text}`)
    act(() => button.click())
  }

  it('adds the mode without removing existing AI-Eye modes', () => {
    const { primary, secondary } = getSmartCameraHubModes(getFeatureFlags())
    const ids = [...primary, ...secondary].map((mode) => mode.id)
    for (const id of ['forgotten', 'check-me', 'items', 'food', 'body', 'ask-ai', 'ai-ear', 'carry-lists', 'eyes']) {
      expect(ids).toContain(id)
    }
    expect(ids).toContain('item-bank')
    expect(primary.find((mode) => mode.id === 'item-bank')).toMatchObject({ needs: [], usesCamera: false })
  })

  it('opens without camera or network and feeds the existing carry list', () => {
    act(() => root.render(<SmartCameraStage featureFlags={getFeatureFlags()} onClose={() => {}} />))
    click('Sakbank & Snabbkoll')
    expect(container.textContent).toContain('Sakbank')
    click('Paraply')
    click('Mina saker')
    click('Lägg i ta-med-listan')

    const carry = loadMemoryState().checklists.find((list) => list.kind === 'carry')
    expect(carry.items.map((item) => item.label)).toContain('Paraply')
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('viktkollen.userData.v1.user.eye-user.itemBank.v1')).toContain('umbrella')

    click('Kolla med AI-Ögat')
    expect(container.textContent).toContain('Har jag glömt något?')
  })
})
