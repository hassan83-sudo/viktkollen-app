/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { itemBankCatalog } from '../itemBankCatalog.js'
import { loadItemBankState, saveItemBankState } from '../itemBankStore.js'
import { createEmptyItemBankState } from '../itemBankModel.js'
import ItemBankMode from './ItemBankMode.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const scope = { kind: 'authenticated', storageId: 'user.ui', userId: 'ui' }

function mount(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(<ItemBankMode scope={scope} {...props} />))
  return {
    click(text) {
      const button = [...container.querySelectorAll('button')].find((node) => node.textContent.includes(text))
      if (!button) throw new Error(`Button not found: ${text}`)
      act(() => button.click())
    },
    container,
    slide: () => container.querySelector('[data-testid="item-bank-slide"]').textContent,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('ItemBankMode', () => {
  let view
  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    view?.unmount()
    view = null
    vi.useRealTimers()
  })

  it('selects items from the bank and saves them for the user', () => {
    view = mount()
    expect(view.container.querySelectorAll('.item-bank-tile').length).toBe(itemBankCatalog.length)
    view.click('Nycklar')
    view.click('Plånbok')
    expect(loadItemBankState(scope).selectedIds).toEqual(['keys', 'wallet'])
    view.click('Mina saker')
    expect(view.container.textContent).toContain('Nycklar')
    expect(view.container.textContent).toContain('Vald')
    expect(view.container.textContent).toContain('ingen sak är AI-verifierad')
  })

  it('hands the selected labels to the AI-Eye carry list', () => {
    saveItemBankState({ ...createEmptyItemBankState(), selectedIds: ['keys', 'phone'] }, scope)
    const onAddToCarryList = vi.fn()
    view = mount({ onAddToCarryList, onOpenCamera: vi.fn() })
    view.click('Lägg i ta-med-listan')
    expect(onAddToCarryList).toHaveBeenCalledWith(['Nycklar', 'Mobil'])
    expect(view.container.textContent).toContain('Kolla med AI-Ögat')
  })

  it('runs the slideshow with pause, resume, restart and fast mode', () => {
    vi.useFakeTimers()
    const ids = itemBankCatalog.slice(0, 30).map((item) => item.id)
    saveItemBankState({ ...createEmptyItemBankState(), selectedIds: ids, speed: 'normal' }, scope)
    view = mount()
    view.click('Snabbkoll')
    view.click('Starta')
    expect(view.slide()).toContain('1 / 30')
    act(() => vi.advanceTimersByTime(1000))
    expect(view.slide()).toContain('2 / 30')

    view.click('Pausa')
    act(() => vi.advanceTimersByTime(5000))
    expect(view.slide()).toContain('2 / 30')
    view.click('Fortsätt')
    act(() => vi.advanceTimersByTime(1000))
    expect(view.slide()).toContain('3 / 30')

    view.click('Starta om')
    expect(view.slide()).toContain('1 / 30')

    view.click('30 saker på ca 10 sek')
    expect(loadItemBankState(scope).speed).toBe('fast')
    view.click('Starta om')
    // 30 saker på ca 10 sekunder. Stega i små steg så att React hinner
    // schemalägga nästa timer mellan varje bild.
    for (let elapsed = 0; elapsed < 9_500; elapsed += 10) act(() => vi.advanceTimersByTime(10))
    expect(view.slide()).not.toContain('Klart!')
    for (let elapsed = 9_500; elapsed < 10_500; elapsed += 10) act(() => vi.advanceTimersByTime(10))
    expect(view.slide()).toContain('Klart!')
  })
})
