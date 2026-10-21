// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n/index.js'
import ChatMessageList from './ChatMessageList.jsx'

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('sv')
})

describe('coach answer sources', () => {
  it.each([
    ['sv', 'Lokalt svar', 'AI-genererat svar'],
    ['en', 'Local answer', 'AI-generated answer'],
    ['es', 'Respuesta local', 'Respuesta generada por IA'],
    ['ar', 'إجابة محلية', 'إجابة مولّدة بالذكاء الاصطناعي'],
  ])('distinguishes local, generated and unclassified answers in %s', async (language, local, generated) => {
    await i18n.changeLanguage(language)
    render(<ChatMessageList chatMessages={[
      { id: 1, role: 'user', text: 'Fråga' },
      { id: 2, role: 'assistant', text: 'Lokala råd', source: 'local' },
      { id: 3, role: 'assistant', text: 'Modellsvar', source: 'openai' },
      { id: 4, role: 'assistant', text: 'Äldre svar' },
    ]} />)
    expect(screen.getByText(local)).toBeTruthy()
    expect(screen.getByText(generated)).toBeTruthy()
    expect(screen.getByText(i18n.t('coach:replySource.unknown'))).toBeTruthy()
  })
})
