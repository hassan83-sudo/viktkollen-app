/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import GlobalSearch from './GlobalSearch.jsx'

describe('GlobalSearch interactions', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens from the trigger, supports keyboard navigation and closes on Escape', async () => {
    await i18n.changeLanguage('sv')
    const onNavigate = vi.fn()
    render(<GlobalSearch onNavigate={onNavigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Öppna global sökning' }))
    expect(screen.getByRole('dialog', { name: 'Global sökning' })).toBeTruthy()

    const field = screen.getByRole('searchbox', { name: 'Sök i Viktkollen' })
    fireEvent.change(field, { target: { value: 'Redo' } })
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    fireEvent.keyDown(field, { key: 'Enter' })

    expect(onNavigate).toHaveBeenCalled()
    expect(onNavigate.mock.calls[0][0].id).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Öppna global sökning' }))
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Sök i Viktkollen' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Global sökning' })).toBeNull()
  })
})
