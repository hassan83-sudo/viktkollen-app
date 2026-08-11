import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SmartNotificationsCard from './SmartNotificationsCard.jsx'

describe('SmartNotificationsCard', () => {
  it('renders a button action and accessible empty state copy', () => {
    const html = renderToStaticMarkup(
      <SmartNotificationsCard
        checkIn={{ date: '2026-08-10' }}
        meals={[]}
        weights={[{ date: '2026-08-10', value: 88 }]}
      />,
    )

    expect(html).toContain('Smart Notifications')
    expect(html).toContain('Visa alla')
    expect(html).toContain('type="button"')
    expect(html).toMatch(/notis(?:er)? väntar/)
    expect(html).not.toMatch(/Prioritet:|Priority:|High|Medium|Low/)
    expect(html).not.toContain('href="#notification-center"')
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})
