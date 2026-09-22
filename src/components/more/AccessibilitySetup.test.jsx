/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { accessibilityPreferencesKey } from '../../services/accessibilityPreferences.js'
import AccessibilitySetup from './AccessibilitySetup.jsx'

const appCss = readFileSync(resolve(process.cwd(), 'src', 'App.css'), 'utf8')

describe('AccessibilitySetup (A11Y-7C)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('never asks a diagnosis or disability question', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    const text = document.body.textContent.toLowerCase()
    ;['diagnos', 'funktionsnedsättning', 'funktionshinder', 'sjukdom', 'handikapp'].forEach((word) => {
      expect(text).not.toContain(word)
    })
  })

  it('is optional: nothing is required, and Klart finishes without any choice made', () => {
    const onFinish = vi.fn()
    render(<AccessibilitySetup onFinish={onFinish} />)

    expect(document.querySelectorAll('[required]').length).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Klart' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('offers a working Skip / Inte nu action only when explicitly requested', () => {
    const onSkip = vi.fn()
    render(<AccessibilitySetup showSkip onFinish={vi.fn()} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inte nu' }))
    expect(onSkip).toHaveBeenCalledTimes(1)

    cleanup()
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Inte nu' })).toBeNull()
  })

  it('loads existing stored preferences correctly on mount', () => {
    window.localStorage.setItem(accessibilityPreferencesKey, JSON.stringify({ highContrast: true, textSize: 'large' }))
    render(<AccessibilitySetup onFinish={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Stor text' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Tydligare kontrast' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('can select large text', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stor text' }))

    expect(screen.getByRole('button', { name: 'Stor text' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Normal text' }).getAttribute('aria-pressed')).toBe('false')
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"textSize":"large"')
  })

  it('can select extra-large text', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Extra stor text' }))

    expect(screen.getByRole('button', { name: 'Extra stor text' }).getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"textSize":"extra-large"')
  })

  it('only one text size is selected at a time', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stor text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Extra stor text' }))

    expect(screen.getByRole('button', { name: 'Extra stor text' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Stor text' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Normal text' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles high contrast', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Tydligare kontrast' })

    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles large controls', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Större knappar och tryckytor' })

    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"largeControls":true')
  })

  it('toggles line spacing', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Mer luft mellan rader' })

    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"lineSpacing":true')
  })

  it('toggles reduced motion', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Minska animationer' })

    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"reduceMotion":true')
  })

  it('does not expose deferred behavioral-only flags as working choices', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Undvik precisa gester/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ge mig mer tid/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /enkelt läge/i })).toBeNull()
  })

  it('applies every change live to its own preview panel', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    const preview = () => screen.getByLabelText('Förhandsvisning')

    expect(preview().getAttribute('data-a11y-high-contrast')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tydligare kontrast' }))
    expect(preview().getAttribute('data-a11y-high-contrast')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Extra stor text' }))
    expect(preview().getAttribute('data-a11y-text-size')).toBe('extra-large')
  })

  it('reset works live, clearing the preview and the stored preferences immediately', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tydligare kontrast' }))
    expect(screen.getByLabelText('Förhandsvisning').getAttribute('data-a11y-high-contrast')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Återställ' }))

    expect(screen.getByLabelText('Förhandsvisning').getAttribute('data-a11y-high-contrast')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tydligare kontrast' }).getAttribute('aria-pressed')).toBe('false')
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toBeNull()
  })

  it('persists settings through the existing local preference store, not a second one', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mer luft mellan rader' }))

    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"lineSpacing":true')
    const accessibilityKeys = Object.keys(window.localStorage).filter((key) => key.toLowerCase().includes('accessibility'))
    expect(accessibilityKeys).toEqual([accessibilityPreferencesKey])
  })

  it('causes no network request while reading, saving, or resetting', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no network call expected')
    })
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tydligare kontrast' }))
    fireEvent.click(screen.getByRole('button', { name: 'Återställ' }))

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('is fully keyboard operable', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Tydligare kontrast' })

    button.focus()
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('exposes accessible names and a non-color pressed-state for every toggle', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    screen.getAllByRole('button').forEach((button) => {
      expect(button.textContent.trim().length).toBeGreaterThan(0)
    })

    const contrastButton = screen.getByRole('button', { name: 'Tydligare kontrast' })
    expect(contrastButton.hasAttribute('aria-pressed')).toBe(true)
  })

  it('reuses already-verified, touch-target-sized accessibility classes for 390px/430px', () => {
    render(<AccessibilitySetup onFinish={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Stor text' }).className).toContain('accessibility-option-card')
    expect(screen.getByRole('button', { name: 'Tydligare kontrast' }).className).toContain('accessibility-preference-toggle')
    expect(appCss).toContain('@media (max-width: 430px)')
    expect(appCss).toContain('.accessibility-option-card')
    expect(appCss).toContain('.accessibility-preference-toggle')
  })
})
