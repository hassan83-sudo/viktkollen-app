/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { companionStorageKey } from '../companion/companionModel.js'
import AnimalWorldSection from './AnimalWorldSection.jsx'
import PregnancyFirstYearSection from './PregnancyFirstYearSection.jsx'
import SignLanguageSection from './SignLanguageSection.jsx'

describe('education sections', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => cleanup())

  it('opens Teckenspråk with STS first, separated future languages and honest text fallback', () => {
    render(<SignLanguageSection onOpenAiCoach={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Teckenspråk' })).toBeTruthy()
    const languageSelect = screen.getByLabelText('Valt teckenspråk')
    expect([...languageSelect.options].map((option) => option.value)).toEqual(['sts', 'asl', 'bsl', 'international-sign'])
    expect(screen.getByText(/Blandar inte teckenspråk/i)).toBeTruthy()
    expect(screen.getByText('Verifierad teckenspråksversion finns inte ännu. Svaret visas som text.')).toBeTruthy()
    expect(screen.queryByText(/jag kan teckna korrekt/i)).toBe(null)
    expect(screen.queryByText(/autentisk teckenvideo/i)).toBe(null)
  })

  it('saves AI buddy communication preferences locally and can reset them', () => {
    render(<SignLanguageSection onOpenAiCoach={() => {}} />)

    fireEvent.change(screen.getByLabelText('Valt teckenspråk'), { target: { value: 'bsl' } })
    fireEvent.change(screen.getByLabelText('Kommunikationspreferens'), { target: { value: 'text-and-verified-sign' } })
    fireEvent.click(screen.getByLabelText('Uppläsning på'))

    expect(JSON.parse(window.localStorage.getItem(companionStorageKey))).toMatchObject({
      communicationPreference: 'text-and-verified-sign',
      prefersSpeech: true,
      selectedSignLanguage: 'bsl',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Återställ' }))
    expect(JSON.parse(window.localStorage.getItem(companionStorageKey))).toMatchObject({
      communicationPreference: 'text',
      prefersSpeech: false,
      selectedSignLanguage: 'sts',
    })
  })

  it('requires active consent before mirror camera start and stops the local stream', async () => {
    const stop = vi.fn()
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ readyState: 'live', stop }],
      getVideoTracks: () => [],
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })

    const { unmount } = render(<SignLanguageSection onOpenAiCoach={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Starta spegel' }))
    expect(screen.getByText('Aktivt samtycke krävs före kamerastart.')).toBeTruthy()
    expect(getUserMedia).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Jag samtycker till att starta kameran som lokal spegel'))
    fireEvent.click(screen.getByRole('button', { name: 'Starta spegel' }))

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('opens Djurvärlden with categories, empty video placeholders and AI labeling', () => {
    render(<AnimalWorldSection />)

    expect(screen.getByRole('heading', { name: 'Djurvärlden' })).toBeTruthy()
    expect(screen.getAllByText('Djurens familjeliv').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fascinerande insekter').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ingen video publicerad').length).toBeGreaterThan(0)
    expect(screen.getByText('AI-genererad illustration - inte autentisk naturfilm.')).toBeTruthy()
    expect(screen.queryByRole('video')).toBe(null)
  })

  it('opens Graviditet & första året with inclusive wording, care paths and no diagnosis', () => {
    render(<PregnancyFirstYearSection />)

    expect(screen.getByRole('heading', { name: 'Graviditet & första året' })).toBeTruthy()
    expect(screen.getByText('gravid person')).toBeTruthy()
    expect(screen.getByText('mamma')).toBeTruthy()
    expect(screen.getByText('0-3 månader')).toBeTruthy()
    expect(screen.getByText('Trimester 1')).toBeTruthy()
    expect(screen.getByText('BVC och kontroller')).toBeTruthy()
    expect(screen.getByText(/kontakta barnmorska, BVC, läkare eller 1177/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ring 112' }).getAttribute('href')).toBe('tel:112')
    expect(screen.getByText('AI-genererad pedagogisk illustration - inte medicinsk avbildning.')).toBeTruthy()
    expect(screen.getByText(/ställer inte diagnos/i)).toBeTruthy()
  })
})
