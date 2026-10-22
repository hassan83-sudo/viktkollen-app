// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWardrobePhoto, wardrobePhotoCanvas } from '../../../services/wardrobePhoto.js'
import { scanObjectBankPhoto } from '../../../services/objectBankScan.js'
import WardrobeGarmentForm from './WardrobeGarmentForm.jsx'

vi.mock('../../../services/wardrobePhoto.js', () => ({ createWardrobePhoto: vi.fn(), wardrobePhotoCanvas: vi.fn() }))
vi.mock('../../../services/objectBankScan.js', () => ({ scanObjectBankPhoto: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const photo = 'data:image/jpeg;base64,YWJj'
async function choosePhoto() {
  createWardrobePhoto.mockResolvedValue(photo)
  fireEvent.change(screen.getByLabelText('Fotografera eller välj bild'), { target: { files: [new File(['image'], 'shirt.jpg', { type: 'image/jpeg' })] } })
  await screen.findByAltText('Förhandsvisning av nytt plagg')
}

describe('wardrobe photo consent', () => {
  it('requires separate local consent, never analyzes automatically, and resets consent for the next image', async () => {
    const onAdd = vi.fn(() => true)
    render(<WardrobeGarmentForm onAdd={onAdd} />)
    await choosePhoto()
    fireEvent.change(screen.getByLabelText('Plaggets namn'), { target: { value: 'Tröjan' } })
    expect(screen.getByRole('button', { name: 'Spara plagg' }).disabled).toBe(true)
    expect(scanObjectBankPhoto).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /sparas i den här webbläsaren/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Spara plagg' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tröjan', image: photo }))
    await choosePhoto()
    expect(screen.getByRole('checkbox', { name: /sparas i den här webbläsaren/ }).checked).toBe(false)
    expect(screen.getByRole('checkbox', { name: /skickas för AI-analys/ }).checked).toBe(false)
  })

  it('sends exactly one explicit analysis and uses suggestions only after manual selection', async () => {
    let resolve
    wardrobePhotoCanvas.mockResolvedValue({})
    scanObjectBankPhoto.mockImplementation(() => new Promise((done) => { resolve = done }))
    const onAdd = vi.fn()
    render(<WardrobeGarmentForm onAdd={onAdd} />)
    await choosePhoto()
    const analyze = screen.getByRole('button', { name: 'Analysera vald bild' })
    expect(analyze.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /skickas för AI-analys/ }))
    fireEvent.click(analyze); fireEvent.click(analyze)
    await waitFor(() => expect(scanObjectBankPhoto).toHaveBeenCalledTimes(1))
    await act(async () => resolve({ ok: true, result: { items: ['Skjorta'] } }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Plaggets namn').value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Använd namnet: Skjorta' }))
    expect(screen.getByLabelText('Plaggets namn').value).toBe('Skjorta')
    expect(analyze.disabled).toBe(true)
  })

  it('aborts an in-flight analysis on unmount and does not save a late result', async () => {
    wardrobePhotoCanvas.mockResolvedValue({})
    let resolve
    scanObjectBankPhoto.mockImplementation(() => new Promise((done) => { resolve = done }))
    const onAdd = vi.fn()
    const view = render(<WardrobeGarmentForm onAdd={onAdd} />)
    await choosePhoto()
    fireEvent.click(screen.getByRole('checkbox', { name: /skickas för AI-analys/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Analysera vald bild' }))
    await waitFor(() => expect(scanObjectBankPhoto).toHaveBeenCalledTimes(1))
    const signal = scanObjectBankPhoto.mock.calls[0][0].signal
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => resolve({ ok: true, result: { items: ['Skjorta'] } }))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('keeps manual entry available after a denied or unavailable analysis', async () => {
    wardrobePhotoCanvas.mockResolvedValue({})
    scanObjectBankPhoto.mockResolvedValue({ ok: false, reason: 'quota_exceeded' })
    render(<WardrobeGarmentForm onAdd={() => true} />)
    await choosePhoto()
    fireEvent.click(screen.getByRole('checkbox', { name: /skickas för AI-analys/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Analysera vald bild' }))
    await screen.findByText(/AI-förslag är inte tillgängliga/)
    expect(scanObjectBankPhoto).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Plaggets namn'), { target: { value: 'Egen tröja' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /sparas i den här webbläsaren/ }))
    expect(screen.getByRole('button', { name: 'Spara plagg' }).disabled).toBe(false)
  })
})
