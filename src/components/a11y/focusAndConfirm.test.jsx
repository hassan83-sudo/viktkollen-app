/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { isFocusTargetFullyVisible, revealKeyboardFocus } from '../../services/accessibilityFocusVisibility.js'
import ForgotSomethingCard from '../sections/ready/ForgotSomethingCard.jsx'

// A11Y-8I: logic-level checks. Geometry (focus not obscured), the real focus
// trap and contrast are proven in Chromium (tests/a11y), not in jsdom.

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

function ForgotHarness({ onConfirm = vi.fn() }) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState('')
  return (
    <ForgotSomethingCard
      forgotText={text}
      onCancel={() => setPending('')}
      onConfirm={() => { onConfirm(pending); setPending(''); setText('') }}
      onForgotTextChange={setText}
      onSubmit={(event) => { event.preventDefault(); setPending('nycklarna') }}
      pendingForgotLabel={pending}
    />
  )
}

describe('navigation focus and confirmations (A11Y-8I)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
  })

  describe('Redo! "Jag glömde något" confirmation', () => {
    function ask() {
      render(<ForgotHarness />)
      const field = screen.getByRole('textbox', { name: 'Beskriv vad du glömde' })
      fireEvent.change(field, { target: { value: 'Jag glömde nycklarna' } })
      fireEvent.click(screen.getByRole('button', { name: 'Fortsätt' }))
      return field
    }

    it('is a named inline question (not a modal dialog) that receives focus', () => {
      ask()
      const question = screen.getByRole('group', { name: 'Vill du lägga till nycklarna på checklistan?' })
      expect(document.activeElement).toBe(question)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(question.getAttribute('aria-live')).toBeNull()
    })

    it('Yes announces the result once in a status region and returns focus to the field', () => {
      const field = ask()
      const status = screen.getByRole('status')
      expect(status.textContent).toBe('')
      fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
      expect(screen.queryByRole('group')).toBeNull()
      expect(document.activeElement).toBe(field)
      expect(status.textContent).toBe('nycklarna har lagts till på checklistan.')
      expect(screen.getAllByRole('status')).toHaveLength(1)
    })

    it('No returns focus to the field without announcing anything', () => {
      const field = ask()
      fireEvent.click(screen.getByRole('button', { name: 'Nej' }))
      expect(document.activeElement).toBe(field)
      expect(screen.getByRole('status').textContent).toBe('')
    })

    it('has an English result message', async () => {
      await i18n.changeLanguage('en')
      render(<ForgotHarness />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
      expect(screen.getByRole('status').textContent).toBe('nycklarna has been added to the checklist.')
    })
  })

  describe('GlobalSearch uses the shared 8C dialog system', () => {
    it('renders through ModalDialog with Escape enabled and the search field as initial focus', () => {
      const searchSource = source('src/components/app/GlobalSearch.jsx')
      expect(searchSource).toContain('<ModalDialog')
      expect(searchSource).toMatch(/closeOnEscape\s+initialFocusRef=\{inputRef\}\s+onClose=\{closeSearch\}/)
      expect(searchSource).not.toContain('role="dialog"')
    })
  })

  describe('keyboard focus visibility helper', () => {
    function withRect(element, rect) {
      element.getBoundingClientRect = () => ({ bottom: rect.top + rect.height, height: rect.height, left: rect.left, right: rect.left + rect.width, top: rect.top, width: rect.width })
    }

    it('treats a control under the fixed bottom navigation as not fully visible', () => {
      document.body.innerHTML = '<nav class="bottom-nav" style="position: fixed"></nav><button type="button">Arkiv</button>'
      withRect(document.querySelector('.bottom-nav'), { height: 70, left: 0, top: window.innerHeight - 70, width: 300 })
      const button = document.querySelector('button')
      withRect(button, { height: 40, left: 10, top: window.innerHeight - 50, width: 100 })
      expect(isFocusTargetFullyVisible(button)).toBe(false)
      withRect(button, { height: 40, left: 10, top: 100, width: 100 })
      expect(isFocusTargetFullyVisible(button)).toBe(true)
    })

    it('only scrolls for keyboard focus (:focus-visible), never for pointer focus', () => {
      document.body.innerHTML = '<button type="button">Spa</button>'
      const button = document.querySelector('button')
      withRect(button, { height: 40, left: -30, top: 100, width: 100 })
      button.scrollIntoView = vi.fn()
      button.matches = (selector) => (selector === ':focus-visible' ? false : Element.prototype.matches.call(button, selector))
      expect(revealKeyboardFocus(button)).toBe(false)
      expect(button.scrollIntoView).not.toHaveBeenCalled()
      button.matches = (selector) => (selector === ':focus-visible' ? true : Element.prototype.matches.call(button, selector))
      expect(revealKeyboardFocus(button)).toBe(true)
      expect(button.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest', inline: 'nearest' }))
    })
  })
})
