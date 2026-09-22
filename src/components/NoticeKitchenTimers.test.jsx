/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NoticeKitchenTimers from './NoticeKitchenTimers.jsx'

// A11Y-6B: verifies the wake-alarm unmount cleanup gap found by A11Y-6A is closed.
// The existing clearWakeSequence() helper (already used by stop/snooze) is reused
// on unmount instead of the component's own partial timer-only cleanup.
describe('NoticeKitchenTimers wake speech cleanup (A11Y-6B)', () => {
  let speechSynthesis

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T06:59:00'))
    speechSynthesis = { cancel: vi.fn(), speak: vi.fn() }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speechSynthesis })
    globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text
    }
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    delete window.speechSynthesis
    delete globalThis.SpeechSynthesisUtterance
  })

  function renderAndActivateWakeAlarm() {
    const result = render(
      <NoticeKitchenTimers reminderState={{ reminders: [] }} onRemindersChange={vi.fn()} onMessage={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sovrum' }))
    fireEvent.change(screen.getByLabelText('Väckningstid'), { target: { value: '07:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sätt väckarklocka' }))
    return result
  }

  // The alarm is armed 1 minute (60000ms) before it fires; advancing by exactly
  // that amount is a known fake-timer boundary edge case (the scheduled
  // callback and the interval clock tick land on the same instant), so tests
  // advance a little past it to reliably reach the fired state.
  const REACH_ALARM_MS = 61000

  it('speaks normally while mounted when the wake alarm fires', () => {
    renderAndActivateWakeAlarm()

    act(() => { vi.advanceTimersByTime(REACH_ALARM_MS) }) // reach 07:00 -> first gentle step (delay 0)

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(speechSynthesis.speak.mock.calls[0][0]).toMatchObject({ text: 'God morgon. Det är dags att vakna.' })
  })

  it('cancels active wake speech and stops pending wake steps on unmount', () => {
    const { unmount } = renderAndActivateWakeAlarm()

    act(() => { vi.advanceTimersByTime(REACH_ALARM_MS) }) // first gentle step speaks
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    speechSynthesis.cancel.mockClear()

    unmount()

    expect(speechSynthesis.cancel).toHaveBeenCalled()

    // The next gentle step (delay 12000ms) must not fire after unmount.
    act(() => { vi.advanceTimersByTime(60000) })
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
  })

  it('is safe to unmount when speechSynthesis is unavailable', () => {
    delete window.speechSynthesis
    const { unmount } = renderAndActivateWakeAlarm()

    act(() => { vi.advanceTimersByTime(REACH_ALARM_MS) })
    expect(() => unmount()).not.toThrow()
  })

  it('is safe to unmount when nothing is speaking (no wake alarm activated)', () => {
    const { unmount } = render(
      <NoticeKitchenTimers reminderState={{ reminders: [] }} onRemindersChange={vi.fn()} onMessage={vi.fn()} />,
    )

    expect(() => unmount()).not.toThrow()
    expect(speechSynthesis.cancel).toHaveBeenCalled()
  })

  it('survives repeated mount/unmount without throwing', () => {
    for (let i = 0; i < 3; i += 1) {
      const { unmount } = renderAndActivateWakeAlarm()
      act(() => { vi.advanceTimersByTime(60000) })
      expect(() => unmount()).not.toThrow()
    }
  })

  it('does not write to unmounted component state after cleanup', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderAndActivateWakeAlarm()

    act(() => { vi.advanceTimersByTime(60000) })
    unmount()
    act(() => { vi.advanceTimersByTime(120000) })

    const reactActWarning = errorSpy.mock.calls.some((call) =>
      String(call[0]).includes('act(') || String(call[0]).includes('unmounted component'))
    expect(reactActWarning).toBe(false)
    errorSpy.mockRestore()
  })
})
