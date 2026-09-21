/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    render(<GlobalSearch listenForShortcut onNavigate={onNavigate} />)

    const trigger = screen.getByRole('button', { name: 'Öppna global sökning' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Global sökning' })).toBeTruthy()
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Sök i Viktkollen' }))
    })

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
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('opens from a remote trigger and a single host shortcut without a second dialog', async () => {
    await i18n.changeLanguage('sv')
    const onNavigate = vi.fn()
    render(
      <>
        <GlobalSearch />
        <GlobalSearch listenForShortcut onNavigate={onNavigate} showTrigger={false} />
      </>,
    )

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getAllByRole('dialog', { name: 'Global sökning' })).toHaveLength(1)

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Sök i Viktkollen' }), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Öppna global sökning' }))
    expect(screen.getAllByRole('dialog', { name: 'Global sökning' })).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getAllByRole('dialog', { name: 'Global sökning' })).toHaveLength(1)
  })

  it('does not steal Ctrl+K from a textarea', async () => {
    await i18n.changeLanguage('sv')
    render(
      <>
        <textarea aria-label="Anteckning" />
        <GlobalSearch listenForShortcut onNavigate={() => {}} showTrigger={false} />
      </>,
    )

    const note = screen.getByRole('textbox', { name: 'Anteckning' })
    note.focus()
    fireEvent.keyDown(note, { key: 'k', ctrlKey: true })
    expect(screen.queryByRole('dialog', { name: 'Global sökning' })).toBeNull()
  })
})
