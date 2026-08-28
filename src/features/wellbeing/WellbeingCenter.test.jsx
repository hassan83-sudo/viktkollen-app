/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.js'
import WellbeingCenter from './WellbeingCenter.jsx'
import { wellbeingStorageKey } from './wellbeingModel.js'

describe('WellbeingCenter', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => cleanup())

  it('keeps check-in voluntary and hidden until the user saves it', () => {
    render(<WellbeingCenter />)

    fireEvent.click(screen.getByRole('button', { name: 'Hoppa över' }))
    expect(window.localStorage.getItem(wellbeingStorageKey)).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: 'Tungt' }))
    fireEvent.click(screen.getByLabelText('Stress'))
    fireEvent.click(screen.getByRole('button', { name: 'Spara check-in' }))

    const stored = JSON.parse(window.localStorage.getItem(wellbeingStorageKey))
    expect(stored.checkIns).toHaveLength(1)
    expect(stored.checkIns[0]).toMatchObject({ mood: 'heavy', reasons: ['stress'] })
  })

  it('shows honest AI placeholder and emergency 112 path', () => {
    render(<WellbeingCenter />)

    expect(screen.getByText('Förhandsläge')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Vad vill du sätta ord på?'), { target: { value: 'Jag känner mig inte säker' } })
    expect(screen.getByRole('alert').textContent).toContain('Ring 112')

    fireEvent.click(screen.getByRole('button', { name: 'Jag känner mig inte säker' }))
    expect(screen.getAllByRole('alert').some((node) => node.textContent.includes('Ring 112'))).toBe(true)
  })

  it('supports safety plan editing and confirmed deletion', () => {
    render(<WellbeingCenter />)

    fireEvent.change(screen.getByLabelText('Trygga personer'), { target: { value: 'Min mentor' } })
    expect(JSON.parse(window.localStorage.getItem(wellbeingStorageKey)).plan.safePeople).toBe('Min mentor')

    fireEvent.click(screen.getByRole('button', { name: 'Radera trygghetsplan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, radera planen' }))
    expect(JSON.parse(window.localStorage.getItem(wellbeingStorageKey)).plan.safePeople).toBe('')
  })

  it('prepares but does not send a support message', () => {
    render(<WellbeingCenter />)

    fireEvent.change(screen.getByLabelText('Kontaktens namn'), { target: { value: 'Alex' } })
    expect(screen.getByLabelText('Meddelandeutkast').value).toContain('Jag mår inte så bra')
    expect(screen.queryByText('Meddelandet har skickats')).toBe(null)
  })
})
