/* @vitest-environment jsdom */
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import HomeNoticeShortcuts from './HomeNoticeShortcuts.jsx'

describe('HomeNoticeShortcuts', () => {
  let root
  let host

  afterEach(() => {
    root?.unmount()
    host?.remove()
  })

  it('is placed in the mood grid before the first paint, so Home does not jump down', () => {
    host = document.createElement('div')
    host.innerHTML = '<section class="overview-today-mood"><button class="overview-mood-card is-wellbeing"></button></section><div id="shortcuts"></div>'
    document.body.append(host)
    root = createRoot(host.querySelector('#shortcuts'))

    // flushSync kör layout-effekter men inte vanliga effekter: kortet ska
    // alltså finnas redan i samma ritning som resten av Hem.
    flushSync(() => root.render(<HomeNoticeShortcuts onOpenNotices={() => {}} />))

    const grid = host.querySelector('.overview-today-mood')
    expect(grid.querySelector('.overview-mood-card.is-quick')).not.toBeNull()
    expect(grid.querySelector('style')?.textContent).toContain('"quick quick"')
  })
})
