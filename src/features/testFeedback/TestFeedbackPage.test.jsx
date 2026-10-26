/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const submitTestFeedback = vi.hoisted(() => vi.fn())
vi.mock('./testFeedbackClient.js', () => ({ submitTestFeedback }))

import TestFeedbackPage from './TestFeedbackPage.jsx'

function fillForm() {
  fireEvent.click(screen.getByLabelText('Matskanning'))
  fireEvent.click(screen.getByLabelText('Appens hastighet'))
  fireEvent.click(screen.getByLabelText('För långsam'))
  fireEvent.change(screen.getByLabelText('Vad fungerar dåligt eller vad vill du förbättra?'), { target: { value: 'Analysen tar lång tid' } })
}

describe('Testa Viktkollen', () => {
  afterEach(() => {
    cleanup()
    submitTestFeedback.mockReset()
  })

  it('kräver inloggning', () => {
    render(<TestFeedbackPage isAuthenticated={false} />)
    expect(screen.getByText('Logga in för att kunna skicka feedback.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skicka feedback' })).toBeNull()
  })

  it('kräver funktion och kategori men inte bedömning', async () => {
    render(<TestFeedbackPage isAuthenticated />)
    fireEvent.click(screen.getByRole('button', { name: 'Skicka feedback' }))
    expect(screen.getByRole('alert').textContent).toContain('Välj minst en funktion')
    fireEvent.click(screen.getByLabelText('Hem'))
    fireEvent.click(screen.getByRole('button', { name: 'Skicka feedback' }))
    expect(screen.getByRole('alert').textContent).toContain('Välj vilken typ')
    expect(submitTestFeedback).not.toHaveBeenCalled()
  })

  it('skickar en gång, visar bekräftelse och rensar först efter lyckad sparning', async () => {
    let resolve
    submitTestFeedback.mockImplementation(() => new Promise((done) => { resolve = done }))
    render(<TestFeedbackPage isAuthenticated />)
    fillForm()
    const button = screen.getByRole('button', { name: 'Skicka feedback' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.submit(button.closest('form'))
    expect(submitTestFeedback).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Vad fungerar dåligt eller vad vill du förbättra?').value).toBe('Analysen tar lång tid')
    const sent = submitTestFeedback.mock.calls[0][0]
    expect(sent).toMatchObject({ category: 'slow', comment: 'Analysen tar lång tid', features: ['food_scan', 'speed'], rating: null })
    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/)
    await act(async () => { resolve({ ok: true }) })
    expect(screen.getByRole('status').textContent).toContain('Tack! Din feedback är sparad')
    expect(screen.getByLabelText('Vad fungerar dåligt eller vad vill du förbättra?').value).toBe('')
    expect(screen.getByLabelText('Matskanning').checked).toBe(false)
  })

  it('behåller svaret och samma request-ID när inskickningen misslyckas', async () => {
    submitTestFeedback.mockResolvedValueOnce({ ok: false, code: 'FEEDBACK_UNAVAILABLE' }).mockResolvedValueOnce({ ok: true })
    render(<TestFeedbackPage isAuthenticated />)
    fillForm()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Skicka feedback' })) })
    expect(screen.getByRole('alert').textContent).toContain('Ditt svar finns kvar')
    expect(screen.getByLabelText('Vad fungerar dåligt eller vad vill du förbättra?').value).toBe('Analysen tar lång tid')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Skicka feedback' })) })
    expect(submitTestFeedback.mock.calls[1][0].requestId).toBe(submitTestFeedback.mock.calls[0][0].requestId)
  })
})
