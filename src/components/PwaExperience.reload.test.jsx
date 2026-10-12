/* @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { controllerChangeReloadAction, isEditingElement } from '../registerServiceWorker.js'

const reloadPage = vi.fn()

vi.mock('../registerServiceWorker.js', async (importOriginal) => ({
  ...(await importOriginal()),
  reloadPage: () => reloadPage(),
}))

const { default: PwaExperience } = await import('./PwaExperience.jsx')
const { default: AuthPanel } = await import('./AuthPanel.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('controllerChangeReloadAction', () => {
  const input = (type = 'email') => ({ tagName: 'INPUT', type })

  it('never reloads when a service worker takes control for the first time', () => {
    expect(controllerChangeReloadAction({ activeElement: null, hadControllerAtStart: false })).toBe('none')
    expect(controllerChangeReloadAction({ activeElement: input(), hadControllerAtStart: false })).toBe('none')
  })

  it('reloads after a worker update, but defers while the user is typing', () => {
    expect(controllerChangeReloadAction({ activeElement: { tagName: 'BODY' }, hadControllerAtStart: true })).toBe('now')
    expect(controllerChangeReloadAction({ activeElement: input('email'), hadControllerAtStart: true })).toBe('defer')
    expect(controllerChangeReloadAction({ activeElement: input('password'), hadControllerAtStart: true })).toBe('defer')
  })

  it('treats only editable fields as typing', () => {
    expect(isEditingElement(input('text'))).toBe(true)
    expect(isEditingElement({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditingElement({ isContentEditable: true, tagName: 'DIV' })).toBe(true)
    expect(isEditingElement(input('submit'))).toBe(false)
    expect(isEditingElement(input('checkbox'))).toBe(false)
    expect(isEditingElement({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditingElement(null)).toBe(false)
  })
})

describe('login page and service worker takeover', () => {
  let container
  let root
  let serviceWorker

  function installServiceWorker({ controller }) {
    serviceWorker = new EventTarget()
    serviceWorker.controller = controller
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
  }

  async function renderLoginPage() {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(
      <>
        <PwaExperience />
        <AuthPanel authError="" authLoading={false} authNotice="" authStatus={{ authEnabled: true }} onSignIn={() => {}} />
      </>,
    ))
    return container.querySelector('input[type=email]')
  }

  function setVisibility(state) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  beforeEach(() => {
    reloadPage.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    delete navigator.serviceWorker
    setVisibility('visible')
  })

  it('keeps the email field usable when the service worker takes control on first visit', async () => {
    installServiceWorker({ controller: null })
    const email = await renderLoginPage()

    expect(email.disabled).toBe(false)
    email.focus()
    serviceWorker.controller = {}
    act(() => serviceWorker.dispatchEvent(new Event('controllerchange')))

    expect(reloadPage).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(container.querySelector('input[type=email]'))
    expect(container.querySelector('input[type=email]')).toBe(email)
  })

  it('does not reload a worker update while the user types, and reloads once the page is hidden', async () => {
    installServiceWorker({ controller: {} })
    const email = await renderLoginPage()
    email.focus()

    act(() => serviceWorker.dispatchEvent(new Event('controllerchange')))
    expect(reloadPage).not.toHaveBeenCalled()

    act(() => setVisibility('hidden'))
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('still reloads a worker update immediately when nobody is typing', async () => {
    installServiceWorker({ controller: {} })
    await renderLoginPage()
    document.activeElement?.blur?.()

    act(() => serviceWorker.dispatchEvent(new Event('controllerchange')))
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })
})
