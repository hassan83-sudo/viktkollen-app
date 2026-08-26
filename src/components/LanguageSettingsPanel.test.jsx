/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LanguageSettingsPanel from './LanguageSettingsPanel.jsx'

describe('LanguageSettingsPanel', () => {
  it('shows native language names and emits changes', () => {
    const onLanguageChange = vi.fn()

    render(<LanguageSettingsPanel language="sv" onLanguageChange={onLanguageChange} />)

    expect(screen.getByRole('option', { name: 'Svenska' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'العربية' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '繁體中文' })).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } })
    expect(onLanguageChange).toHaveBeenCalledWith('en')
  })
})
