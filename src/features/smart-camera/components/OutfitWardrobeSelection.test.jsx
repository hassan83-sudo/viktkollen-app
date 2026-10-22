// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wardrobeStorageKey } from '../../../services/wardrobeStorage.js'
import OutfitWardrobeSelection from './OutfitWardrobeSelection.jsx'
import SmartCameraModeViews from './SmartCameraModeViews.jsx'

vi.mock('./SmartCameraLiveView.jsx', () => ({
  default: ({ enabled, onActiveChange }) => <button disabled={!enabled} onClick={() => onActiveChange?.(true)}>Testkamera</button>,
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const wardrobe = {
  garments: [
    { id: 'shirt', name: 'Blå tröja', type: 'Tröja' },
    { id: 'jeans', name: 'Svarta jeans', type: 'Jeans' },
  ],
  worn: [{ date: '2026-10-21', garmentIds: ['shirt'] }],
}

describe('outfit wardrobe link', () => {
  it('reads existing clothes and supports multiple selection without changing the wardrobe or worn history', () => {
    const saved = JSON.stringify(wardrobe)
    window.localStorage.setItem(wardrobeStorageKey, saved)
    render(<OutfitWardrobeSelection />)
    const shirt = screen.getByRole('checkbox', { name: 'Blå tröja · Tröja' })
    const jeans = screen.getByRole('checkbox', { name: 'Svarta jeans · Jeans' })
    fireEvent.click(shirt)
    fireEvent.click(jeans)
    expect(shirt.checked).toBe(true)
    expect(jeans.checked).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('Blå tröja, Svarta jeans')
    fireEvent.click(shirt)
    expect(screen.getByRole('status').textContent).not.toContain('Blå tröja')
    expect(window.localStorage.getItem(wardrobeStorageKey)).toBe(saved)
  })

  it.each([null, '{broken', '{"garments":null}', '{"garments":[null,{"id":"bad"}]}'])(
    'handles absent or invalid stored clothes safely: %s', (saved) => {
      if (saved !== null) window.localStorage.setItem(wardrobeStorageKey, saved)
      render(<OutfitWardrobeSelection />)
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
      expect(screen.getByText(/Du har inga sparade kläder/)).toBeTruthy()
      expect(screen.getByRole('status').textContent).toContain('Inga plagg valda')
    },
  )

  it('shows the wardrobe inside outfit mode alongside the existing camera and weather', () => {
    window.localStorage.setItem(wardrobeStorageKey, JSON.stringify(wardrobe))
    const onCameraActive = vi.fn()
    render(<SmartCameraModeViews
      mode={{ id: 'outfit', label: 'Kläder & stil' }}
      onCameraActive={onCameraActive}
      adapters={{ weather: { hasLiveWeather: true, temperatureC: 12, windSpeedMs: 5 } }}
    />)
    expect(screen.getByRole('checkbox', { name: 'Blå tröja · Tröja' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Väder just nu' })).toBeTruthy()
    expect(screen.getByText(/12°C/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Testkamera' }))
    expect(onCameraActive).toHaveBeenCalledWith(true)
  })
})
