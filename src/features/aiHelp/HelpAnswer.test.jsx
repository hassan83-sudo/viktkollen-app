/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HelpAnswer from './HelpAnswer.jsx'

afterEach(cleanup)

describe('safe readable help answers', () => {
  it('renders paragraphs, explicit line breaks, headings and both kinds of lists', () => {
    const { container } = render(<HelpAnswer text={'Första raden\r\nAndra raden\r\n\r\n### 9 kr/månad\n- AI-coach: 70\n- Matskanning: 20\n\n### Skillnader\n1. Kontrollera planen\n2. Kontrollera kvoten'} />)
    expect(screen.getByRole('heading', { name: '9 kr/månad', level: 3 })).toBeTruthy()
    expect(container.querySelector('p').textContent).toBe('Första raden\nAndra raden')
    expect(container.querySelectorAll('ul li')).toHaveLength(2)
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
  })

  it('shows hostile HTML, links and images as literal text without executable markup', () => {
    const input = '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[click](javascript:alert(1))\n![image](https://example.test/tracker)'
    const { container } = render(<HelpAnswer text={input} />)
    expect(container.querySelectorAll('script,img,a,iframe,svg')).toHaveLength(0)
    expect(container.textContent).toBe(input)
  })

  it('preserves the starting step number in a continued troubleshooting list', () => {
    const { container } = render(<HelpAnswer text={'3. Kontrollera kvoten\n4. Försök igen'} />)
    expect(container.querySelector('ol').getAttribute('start')).toBe('3')
  })

  it.each([
    ['sv', 'Inställningar', 'Kontrollera planen.'],
    ['en', 'Settings', 'Check the plan.'],
    ['es', 'Configuración', 'Comprueba el plan.'],
    ['ar', 'الإعدادات', 'تحقق من الخطة.'],
  ])('preserves %s facts and text through long answer formatting', (language, heading, sentence) => {
    const text = Array.from({ length: 40 }, () => sentence).join(' ')
    const { container } = render(<section dir={language === 'ar' ? 'rtl' : 'ltr'}><HelpAnswer language={language} text={`### ${heading}\n${text}\n\n- 9 kr/månad\n- 19 kr/månad`} /></section>)
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    expect(container.querySelector('.ai-help-answer').lang).toBe(language)
    expect(container.querySelectorAll('p').length).toBeGreaterThan(1)
    expect([...container.querySelectorAll('p')].map((p) => p.textContent).join('')).toBe(text)
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })
})
