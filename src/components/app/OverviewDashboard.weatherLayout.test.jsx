/* @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let resolveWeather
let rejectWeather

vi.mock('../../services/overviewWeather.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadOverviewWeather: vi.fn(() => new Promise((resolve, reject) => {
    resolveWeather = resolve
    rejectWeather = reject
  })),
}))

const { default: OverviewDashboard } = await import('./OverviewDashboard.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const liveWeather = {
  city: 'Helsingborg',
  condition: 'Mulet',
  feelsLikeC: 12,
  hasLiveWeather: true,
  icon: '☁',
  precipitationRiskPercent: 20,
  sunrise: '2026-10-12T07:31',
  sunriseLabel: '07:31',
  sunset: '2026-10-12T18:12',
  sunsetLabel: '18:12',
  temperatureC: 14,
  windSpeedMs: 6,
}

// Struktur som avgör höjden: vilka rader som finns och vilka knappar de har.
// (Datumraden får stadens namn efter laddning, men bara i bredd på samma rad.)
function headerStructure(container) {
  const meta = container.querySelector('.overview-live-meta')
  return [...meta.querySelectorAll(':scope > p')].map((p, index) => ({
    buttons: [...p.querySelectorAll('button')].map((button) => button.className),
    spans: index === 0 ? 'date row' : p.querySelectorAll(':scope > span').length,
  }))
}

describe('Home weather header layout', () => {
  let container
  let root

  beforeEach(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<OverviewDashboard />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('reserves the final weather rows while loading, invisibly, so Home does not jump when weather arrives', async () => {
    const loading = headerStructure(container)
    const row = container.querySelector('.overview-weather-row')
    expect(row.getAttribute('aria-hidden')).toBe('true')
    expect(row.style.visibility).toBe('hidden')
    const pendingSunRow = container.querySelector('.overview-weather-pending')
    expect(pendingSunRow.getAttribute('aria-hidden')).toBe('true')
    expect(pendingSunRow.style.visibility).toBe('hidden')

    await act(async () => resolveWeather(liveWeather))

    expect(headerStructure(container)).toEqual(loading)
    expect(container.querySelector('.overview-weather-row').getAttribute('aria-hidden')).toBeNull()
    expect(container.querySelector('.overview-weather-row').style.visibility).toBe('')
    expect(container.querySelector('.overview-weather-pending')).toBeNull()
    expect(container.querySelector('.overview-weather-row').textContent).toContain('14°C')
  })

  it('shows the not-connected state only when loading really fails', async () => {
    expect(container.textContent).not.toContain('Väder ej anslutet')

    await act(async () => rejectWeather(new Error('weather_unavailable')))

    expect(container.querySelector('.overview-weather-pending')).toBeNull()
    expect(container.querySelector('.overview-weather-row').getAttribute('aria-hidden')).toBeNull()
    expect(container.querySelector('.overview-weather-empty')).not.toBeNull()
  })
})
