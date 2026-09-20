/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import AccessibilityHub from './AccessibilityHub.jsx'
import MoreHub from './MoreHub.jsx'

const sectionTitles = [
  'Syn',
  'Hörsel',
  'Tal & kommunikation',
  'Motorik',
  'Läsning',
  'Kognitivt stöd',
  'Enkelt läge',
  'Äldre',
]

function renderAccessibilityHub({ onBack = vi.fn(), onOpenEar = vi.fn(), onOpenEye = vi.fn() } = {}) {
  return render(
    <MoreHub activeFolder="accessibility" onBack={onBack}>
      <AccessibilityHub onOpenEar={onOpenEar} onOpenEye={onOpenEye} />
    </MoreHub>,
  )
}

describe('AccessibilityHub', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
  })

  afterEach(() => cleanup())

  it('opens the dedicated accessibility hub from More with all eight sections', () => {
    renderAccessibilityHub()

    expect(screen.getByRole('heading', { name: 'Tillgänglighet & hjälpmedel' })).toBeTruthy()
    sectionTitles.forEach((title) => {
      expect(screen.getByRole('button', { name: new RegExp(`^${title}`) })).toBeTruthy()
    })
  })

  it('opens every coming-later detail and returns to the accessibility hub', () => {
    renderAccessibilityHub()

    sectionTitles.forEach((title) => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }))

      expect(screen.getByRole('heading', { name: title, level: 2 })).toBeTruthy()
      expect(screen.getByRole('status').textContent).toBe('Kommer senare')

      fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
      expect(screen.getByRole('button', { name: new RegExp(`^${title}`) })).toBeTruthy()
    })
  })

  it('returns to the More hub from the accessibility hub', () => {
    const onBack = vi.fn()
    renderAccessibilityHub({ onBack })

    fireEvent.click(screen.getByRole('button', { name: '← Tillbaka' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('opens the existing AI Eye from the vision detail', () => {
    const onOpenEye = vi.fn()
    renderAccessibilityHub({ onOpenEye })

    fireEvent.click(screen.getByRole('button', { name: /^Syn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI Ögat' }))

    expect(onOpenEye).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('Kommer senare')
  })

  it('opens the existing AI Ear from the hearing detail', () => {
    const onOpenEar = vi.fn()
    renderAccessibilityHub({ onOpenEar })

    fireEvent.click(screen.getByRole('button', { name: /^Hörsel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI Örat' }))

    expect(onOpenEar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('Kommer senare')
  })
})
