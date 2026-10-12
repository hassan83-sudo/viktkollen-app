/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Samma uppbyggnad som Hems sidhuvud: datumrad, väderrad och solrad.
function renderHeader({ live = true } = {}) {
  document.body.innerHTML = `
    <section id="app-section-home" class="is-active">
      <div class="overview-live-meta">
        <div class="overview-live-status"></div>
        <p><span><svg></svg> Mån 12 okt.</span><span><svg></svg> 16:40:00</span></p>
        <p class="overview-weather-row">${live
    ? '<span>14°C</span><span><svg></svg> 6 m/s</span><span><svg></svg> 20 %</span><button class="overview-weather-day-link">Visa hela dagen</button>'
    : '<span class="overview-weather-empty">Väder ej anslutet</span><button class="overview-weather-connect">Koppla väder</button>'}</p>
      </div>
    </section>`
  return document.querySelector('.overview-weather-row')
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// Varje import av en enhancer startar en MutationObserver; koppla bort dem
// efter varje test så att en tidigare instans inte påverkar nästa test.
const observers = []
const NativeMutationObserver = globalThis.MutationObserver
class TrackedMutationObserver extends NativeMutationObserver {
  constructor(callback) {
    super(callback)
    observers.push(this)
  }
}

beforeEach(() => {
  globalThis.MutationObserver = TrackedMutationObserver
})

afterEach(() => {
  observers.splice(0).forEach((observer) => observer.disconnect())
  globalThis.MutationObserver = NativeMutationObserver
  document.body.innerHTML = ''
})

describe('Home live clock', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.useRealTimers())

  it('updates the clock in the date row and never overwrites the wind value', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T14:41:07Z'))
    const row = renderHeader()
    await import('./homeLiveClockEnhancer.js')
    vi.advanceTimersByTime(1000)

    const dateRow = document.querySelector('.overview-live-meta > p')
    expect(dateRow.querySelectorAll('span')[1].textContent).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(dateRow.querySelectorAll('span')[1].textContent).not.toContain('16:40:00')
    expect(row.querySelectorAll('span')[1].textContent.trim()).toBe('6 m/s')
  })
})

describe('Home wind gust', () => {
  let resolveGust

  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveGust = resolve })))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reserves the gust in the same frame as the live weather row, then fills it in place', async () => {
    const row = renderHeader()
    await import('./homeWindGustEnhancer.js')

    // Direkt, innan byvinden hämtats: osynlig platshållare på slutlig plats.
    const placeholder = row.querySelector('.overview-wind-gust')
    expect(placeholder).not.toBeNull()
    expect(placeholder.style.visibility).toBe('hidden')
    expect(placeholder.getAttribute('aria-hidden')).toBe('true')
    expect(placeholder.previousElementSibling.textContent).toContain('m/s')

    resolveGust({ json: async () => ({ current: { wind_gusts_10m: 11.4 } }), ok: true })
    for (let i = 0; i < 6; i += 1) await flush()

    const gust = row.querySelector('.overview-wind-gust')
    expect(gust).toBe(placeholder)
    expect(gust.textContent).toBe('(byvind 11 m/s)')
    expect(gust.style.visibility).toBe('')
    expect(gust.getAttribute('aria-hidden')).toBeNull()
  })

  it('does not add a gust to the not-connected row', async () => {
    const row = renderHeader({ live: false })
    await import('./homeWindGustEnhancer.js')
    resolveGust({ json: async () => ({ current: { wind_gusts_10m: 11.4 } }), ok: true })
    for (let i = 0; i < 6; i += 1) await flush()
    expect(row.querySelector('.overview-wind-gust')).toBeNull()
  })

  it('removes the placeholder when no gust value is available', async () => {
    const row = renderHeader()
    await import('./homeWindGustEnhancer.js')
    resolveGust({ json: async () => ({ current: {} }), ok: true })
    for (let i = 0; i < 6; i += 1) await flush()
    expect(row.querySelector('.overview-wind-gust')).toBeNull()
  })
})
