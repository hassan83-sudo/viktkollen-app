import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import InsightsCenter from './InsightsCenter.jsx'

describe('InsightsCenter', () => {
  it('renders trends milestones consistency and focus areas', () => {
    const html = renderToStaticMarkup(
      <InsightsCenter
        checkIn={{ energy: 6, steps: 7000 }}
        meals={[{ date: '2026-08-03', id: 'm1', protein: 30, text: 'Ägg' }]}
        today="2026-08-04"
        weights={[{ date: '2026-08-01', value: 91 }, { date: '2026-08-04', value: 90 }]}
      />,
    )

    expect(html).toContain('Insights Center')
    expect(html).toContain('Momentum')
    expect(html).toContain('Consistency')
    expect(html).toContain('Trends')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('[object Object]')
  })
})
