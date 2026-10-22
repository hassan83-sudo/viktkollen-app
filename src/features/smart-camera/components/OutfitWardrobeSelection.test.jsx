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
  it('persists multiple selection without changing garments or worn history', () => {
    const saved = JSON.stringify(wardrobe)
    window.localStorage.setItem(wardrobeStorageKey, saved)
    render(<OutfitWardrobeSelection />)
    const shirt = screen.getByRole('checkbox', { name: 'Blå tröja · Tröja' })
    const jeans = screen.getByRole('checkbox', { name: 'Svarta jeans · Jeans' })
    fireEvent.click(shirt)
    fireEvent.click(jeans)
    expect(shirt.checked).toBe(true)
    expect(jeans.checked).toBe(true)
    expect(screen.getByTestId('wardrobe-selection').textContent).toContain('Blå tröja, Svarta jeans')
    fireEvent.click(shirt)
    expect(screen.getByTestId('wardrobe-selection').textContent).not.toContain('Blå tröja')
    const updated = JSON.parse(window.localStorage.getItem(wardrobeStorageKey))
    expect(updated.selectedGarmentIds).toEqual(['jeans'])
    expect(updated.worn).toEqual(wardrobe.worn)
    expect(updated.garments).toEqual(wardrobe.garments.map((garment) => ({ ...garment, image: '' })))
  })

  it.each([null, '{broken', '{"garments":null}', '{"garments":[null,{"id":"bad"}]}'])(
    'handles absent or invalid stored clothes safely: %s', (saved) => {
      if (saved !== null) window.localStorage.setItem(wardrobeStorageKey, saved)
      render(<OutfitWardrobeSelection />)
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
      expect(screen.getByText(/Du har inga sparade kläder/)).toBeTruthy()
      expect(screen.getByTestId('wardrobe-selection').textContent).toContain('Inga plagg valda')
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

  it('saves and restores an outfit, survives remount, and removes only the confirmed garment and references', () => {
    window.localStorage.setItem(wardrobeStorageKey, JSON.stringify(wardrobe))
    const view = render(<OutfitWardrobeSelection />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blå tröja · Tröja' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Svarta jeans · Jeans' }))
    fireEvent.change(screen.getByLabelText('Outfitens namn'), { target: { value: 'Vardag' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara outfit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Avmarkera alla' }))
    fireEvent.click(screen.getByRole('button', { name: 'Välj Vardag' }))
    expect(screen.getByTestId('wardrobe-selection').textContent).toContain('Blå tröja, Svarta jeans')
    view.unmount()
    render(<OutfitWardrobeSelection />)
    expect(screen.getByRole('checkbox', { name: 'Blå tröja · Tröja' }).checked).toBe(true)
    expect(screen.getByRole('img', { name: /Schematisk 2D-docka/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Blå tröja' }))
    expect(JSON.parse(localStorage.getItem(wardrobeStorageKey)).garments).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Bekräfta radering' }))
    const saved = JSON.parse(localStorage.getItem(wardrobeStorageKey))
    expect(saved.garments.map((g) => g.id)).toEqual(['jeans'])
    expect(saved.outfits[0].garmentIds).toEqual(['jeans'])
    expect(saved.worn[0].garmentIds).toEqual([])
  })

  it('adds a manual garment and records wear only after an explicit action', () => {
    render(<OutfitWardrobeSelection />)
    fireEvent.change(screen.getByLabelText('Plaggets namn'), { target: { value: 'Jackan' } })
    fireEvent.change(screen.getByLabelText('Plaggtyp'), { target: { value: 'Jacka' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara plagg' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Jackan · Jacka' }))
    expect(JSON.parse(localStorage.getItem(wardrobeStorageKey)).worn).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Jag har dessa idag' }))
    expect(JSON.parse(localStorage.getItem(wardrobeStorageKey)).worn[0].garmentIds).toHaveLength(1)
  })
})
