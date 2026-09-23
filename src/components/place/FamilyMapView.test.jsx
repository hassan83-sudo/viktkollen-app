/* @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./SchoolCardEnhancer.js', () => ({}))
vi.mock('./TripSharePanel.jsx', () => ({ default: () => null }))
vi.mock('./RouteShareControls.jsx', () => ({ default: () => null }))
vi.mock('./PlaceVoiceCallPanel.jsx', () => ({ default: () => null }))
vi.mock('../../features/place/placeSafePlacesService.js', () => ({
  loadSafePlaces: vi.fn(async () => ({ data: [], error: null })),
}))

import FamilyMapView from './FamilyMapView.jsx'

function location(overrides = {}) {
  return {
    family_id: 'family-1',
    user_id: 'person-1',
    latitude: 59.3293,
    longitude: 18.0686,
    accuracy_meters: 8,
    location_recorded_at: '2026-09-23T12:00:00.000Z',
    display_name: 'Alex',
    ...overrides,
  }
}

function mapFrame() {
  return document.querySelector('.family-map-frame iframe')
}

describe('FamilyMapView map reload', () => {
  afterEach(() => cleanup())

  it('does not reload the map when coordinates stay the same', () => {
    const view = render(<FamilyMapView locations={[location()]} familyMembers={[]} />)
    const frame = mapFrame()
    const src = frame.getAttribute('src')
    frame.dataset.marker = 'kept'
    view.rerender(<FamilyMapView locations={[location({ location_recorded_at: '2026-09-23T12:00:05.000Z' })]} familyMembers={[]} />)
    const next = mapFrame()
    expect(next.dataset.marker).toBe('kept')
    expect(next.getAttribute('src')).toBe(src)
    expect(next.getAttribute('src')).toContain('openstreetmap.org')
  })

  it('updates the map when the location meaningfully moves', () => {
    const view = render(<FamilyMapView locations={[location()]} familyMembers={[]} />)
    const frame = mapFrame()
    const src = frame.getAttribute('src')
    frame.dataset.marker = 'kept'
    view.rerender(<FamilyMapView locations={[location({
      latitude: 59.3293 + 80 / 111320,
      location_recorded_at: '2026-09-23T12:00:05.000Z',
    })]} familyMembers={[]} />)
    const next = mapFrame()
    expect(next.dataset.marker).not.toBe('kept')
    expect(next.getAttribute('src')).not.toBe(src)
    expect(next.getAttribute('src')).toContain('openstreetmap.org')
  })
})
