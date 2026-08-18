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

  it('renders empty defaults without turning missing values into zero', () => {
    const markup = renderToStaticMarkup(
      <CheckIn
        checkIn={{ energy: null, mood: '', steps: null, workout: false }}
        foodScore={0}
        foodTotal={0}
        onUpdateCheckIn={vi.fn()}
      />,
    )

    expect(markup).toContain('Inte valt')
    expect(markup).toContain('placeholder="Ange steg"')
    expect(markup).toContain('Välj humör')
    expect(markup).not.toContain('value="0"')
  })
})
