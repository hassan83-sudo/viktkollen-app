import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CheckIn from './CheckIn.jsx'

describe('CheckIn', () => {
  it('renders immediate check-in controls and summary text', () => {
    const markup = renderToStaticMarkup(
      <CheckIn
        checkIn={{ energy: 7, mood: 'Fokuserad', steps: 7200, workout: true }}
        foodScore={3}
        foodTotal={4}
        onUpdateCheckIn={vi.fn()}
      />,
    )

    expect(markup).toContain('Dagens check-in')
    expect(markup).toContain('value="7200"')
    expect(markup).toContain('Fokuserad')
    expect(markup).toContain('Nästa steg')
  })
})
