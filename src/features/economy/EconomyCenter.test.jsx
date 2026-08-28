/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.js'
import EconomyCenter from './EconomyCenter.jsx'
import { economyStorageKey } from './economyModel.js'

describe('EconomyCenter', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => cleanup())

  it('requires voluntary activation and shows privacy before storing finance data', () => {
    render(<EconomyCenter />)

    expect(screen.getByText('Ingen bank, Open Banking, kortnummer eller konto kopplas.')).toBeTruthy()
    expect(window.localStorage.getItem(economyStorageKey)).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: 'Aktivera Ekonomi lokalt' }))

    expect(JSON.parse(window.localStorage.getItem(economyStorageKey)).settings.activated).toBe(true)
  })

  it('shows empty wheel without fake data and saves a manual purchase', () => {
    render(<EconomyCenter />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera Ekonomi lokalt' }))

    expect(screen.getByText('Inga utgifter registrerade för vald månad. Tavlan visar ingen exempeldata.')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Köp' }))
    fireEvent.change(screen.getByLabelText('Beskrivning eller butik'), { target: { value: 'ICA' } })
    fireEvent.change(screen.getByLabelText('Belopp'), { target: { value: '123,45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara köp' }))

    const stored = JSON.parse(window.localStorage.getItem(economyStorageKey))
    expect(stored.purchases[0]).toMatchObject({ amountMinor: 12345, description: 'ICA', type: 'purchase' })
  })

  it('keeps amount hiding local and hidden from screen reader text', () => {
    render(<EconomyCenter />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera Ekonomi lokalt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dölj belopp' }))

    expect(JSON.parse(window.localStorage.getItem(economyStorageKey)).settings.amountsHidden).toBe(true)
    expect(screen.getAllByText('••••').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beloppen är dolda').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^0\s*kr$/)).toBe(null)
  })

  it('supports budget, debt, bill, subscription and saving tabs without backend traffic', () => {
    render(<EconomyCenter />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera Ekonomi lokalt' }))

    fireEvent.click(screen.getByRole('tab', { name: 'Budget' }))
    fireEvent.change(screen.getByLabelText('Belopp'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara budget' }))
    expect(screen.getByText(/Inte tillräckligt med data ännu/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Skulder' }))
    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Studielån' } })
    fireEvent.change(screen.getByLabelText('Ursprungligt belopp'), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText('Kvarvarande belopp'), { target: { value: '9000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara skuld' }))
    expect(screen.getByText(/Snöboll/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Räkningar' }))
    fireEvent.change(screen.getAllByLabelText('Namn')[0], { target: { value: 'Hyra' } })
    fireEvent.change(screen.getAllByLabelText('Belopp')[0], { target: { value: '7500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara räkning' }))
    expect(screen.getByText(/Hyra/)).toBeTruthy()

    fireEvent.change(screen.getAllByLabelText('Namn')[1], { target: { value: 'Streaming' } })
    fireEvent.change(screen.getAllByLabelText('Belopp')[1], { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara abonnemang' }))
    expect(screen.getByText(/Streaming/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Sparande' }))
    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Buffert' } })
    fireEvent.change(screen.getByLabelText('Målbelopp'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara mål' }))
    expect(screen.getAllByText(/Buffert/).length).toBeGreaterThan(0)
  })

  it('requires confirmation before deleting entries and clearing all economy data', () => {
    render(<EconomyCenter />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera Ekonomi lokalt' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Köp' }))
    fireEvent.change(screen.getByLabelText('Beskrivning eller butik'), { target: { value: 'Apotek' } })
    fireEvent.change(screen.getByLabelText('Belopp'), { target: { value: '88' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara köp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Radera' }))

    expect(screen.getByRole('alert').textContent).toContain('Radering kräver bekräftelse.')
    fireEvent.click(screen.getByRole('button', { name: 'Ja, radera' }))
    expect(JSON.parse(window.localStorage.getItem(economyStorageKey)).purchases).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Radera all Ekonomi-data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, radera all Ekonomi-data' }))
    expect(window.localStorage.getItem(economyStorageKey)).toBe(null)
  })
})
