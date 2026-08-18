import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NotificationCenter from './NotificationCenter.jsx'

describe('NotificationCenter', () => {
  it('renders upcoming history and quiet hour settings', () => {
    const html = renderToStaticMarkup(
      <NotificationCenter
        reminderState={{
          notificationsV3: {
            history: [{ at: '2026-08-04T10:00:00.000Z', id: 'h1', status: 'completed', statusLabel: 'Klar', title: 'Måltid' }],
          },
          reminders: [{
            createdAt: '2026-08-01T08:00:00.000Z',
            enabled: true,
            id: 'r1',
            scheduleType: 'daily',
            startDate: '2026-08-01',
            time: '09:00',
            title: 'Måltid',
            type: 'meal_log',
            updatedAt: '2026-08-01T08:00:00.000Z',
          }],
        }}
      />,
    )

    expect(html).toContain('Notiscenter')
    expect(html).toContain('Tysta timmar')
    expect(html).toContain('Klara')
    expect(html).toContain('Behörighet: Stöds inte')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('[object Object]')
  })

  it('updates quiet hour settings through callbacks', () => {
    let nextState = null
    const html = renderToStaticMarkup(
      <NotificationCenter
        onReminderStateChange={(value) => { nextState = value }}
        reminderState={{ notificationsV3: { settings: { quietHours: { end: '07:00', start: '22:00' } } } }}
      />,
    )

    expect(html).toContain('type="time"')
    expect(nextState).toBeNull()
  })

  it('renders smart notification actions', () => {
    const html = renderToStaticMarkup(
      <NotificationCenter
        checkIn={{}}
        meals={[]}
        reminderState={{ notificationsV3: {} }}
        weights={[]}
      />,
    )

    expect(html).toContain('Smarta notiser')
    expect(html).toContain('Klar')
    expect(html).toContain('Visa senare')
    expect(html).toContain('Ignorera')
  })
})
