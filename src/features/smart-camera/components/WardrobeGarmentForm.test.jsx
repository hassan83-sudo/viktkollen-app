// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWardrobePhoto, wardrobePhotoCanvas } from '../../../services/wardrobePhoto.js'
import { scanObjectBankPhoto } from '../../../services/objectBankScan.js'
import WardrobeGarmentForm from './WardrobeGarmentForm.jsx'
vi.mock('../../../services/wardrobePhoto.js', () => ({ createWardrobePhoto: vi.fn(), wardrobePhotoCanvas: vi.fn() }))
vi.mock('../../../services/objectBankScan.js', () => ({ scanObjectBankPhoto: vi.fn() }))
vi.mock('../../../services/supabaseClient.js', () => ({ isWardrobeOffline: false }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const photo = 'data:image/jpeg;base64,YWJj'
const review = { verdict: 'garment', reason: null, personPresent: false, singleItem: true, name: 'Blå skjorta', category: 'Skjorta', colorName: 'Blå', colorHex: '#446fa4' }
beforeEach(() => { createWardrobePhoto.mockResolvedValue(photo); wardrobePhotoCanvas.mockResolvedValue({}) })
async function choosePhoto() {
  fireEvent.change(screen.getByLabelText('Fotografera eller välj bild'), { target: { files: [new File(['image'], 'shirt.jpg', { type: 'image/jpeg' })] } })
  await waitFor(() => expect(createWardrobePhoto).toHaveBeenCalled())
}
function consent() {
  fireEvent.click(screen.getByRole('checkbox', { name: /skickas för AI-analys/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /sparas i den här webbläsaren/ }))
}
describe('mandatory wardrobe photo review', () => {
  it('never saves or sends a photo without AI consent and explicit approval', async () => {
    const onAdd = vi.fn()
    render(<WardrobeGarmentForm onAdd={onAdd} />)
    await choosePhoto()
    await screen.findByAltText('Förhandsvisning av nytt plagg')
    fireEvent.change(screen.getByLabelText('Plaggets namn'), { target: { value: 'Tröja' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /sparas i den här webbläsaren/ }))
    fireEvent.submit(screen.getByRole('form'))
    expect(scanObjectBankPhoto).not.toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Spara plagg' }).disabled).toBe(true)
  })
  it('analyzes once, prefills editable fields and saves only the approved image', async () => {
    scanObjectBankPhoto.mockResolvedValue({ ok: true, result: review })
    const onAdd = vi.fn(() => true)
    render(<WardrobeGarmentForm onAdd={onAdd} />)
    consent(); await choosePhoto()
    await waitFor(() => expect(screen.getByLabelText('Plaggets namn').value).toBe('Blå skjorta'))
    expect(scanObjectBankPhoto).toHaveBeenCalledTimes(1)
    expect(scanObjectBankPhoto.mock.calls[0][0]).toMatchObject({ mode: 'wardrobe', consentApproved: true })
    expect(screen.getByLabelText('Plaggtyp').value).toBe('Skjorta')
    fireEvent.change(screen.getByLabelText('Plaggets namn'), { target: { value: 'Min skjorta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara plagg' }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Min skjorta', type: 'Skjorta', color: '#446fa4', image: photo })
  })
  it.each([{ ok: true, result: { verdict: 'reject', reason: 'person' } }, { ok: true, result: { items: ['Skjorta'] } }, { ok: false, reason: 'quota_exceeded' }])('discards rejected or unreviewed photos; permits manual text only: %j', async (response) => {
    scanObjectBankPhoto.mockResolvedValue(response)
    const onAdd = vi.fn(() => true)
    render(<WardrobeGarmentForm onAdd={onAdd} />)
    consent(); await choosePhoto()
    await waitFor(() => expect(screen.getByRole('status').textContent).not.toBe('Granskar bilden…'))
    expect(screen.queryByAltText('Förhandsvisning av nytt plagg')).toBeNull()
    fireEvent.change(screen.getByLabelText('Plaggets namn'), { target: { value: 'Egen tröja' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara plagg' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ image: '' }))
  })
  it('opens the camera after successful save-and-next and requires a new review', async () => {
    scanObjectBankPhoto.mockResolvedValue({ ok: true, result: review })
    const onAdd = vi.fn(() => true)
    render(<WardrobeGarmentForm onAdd={onAdd} />)
    consent(); await choosePhoto()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spara och fota nästa' }).disabled).toBe(false))
    const click = vi.spyOn(screen.getByLabelText('Ta bild med kameran'), 'click')
    fireEvent.click(screen.getByRole('button', { name: 'Spara och fota nästa' }))
    expect(onAdd).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1)
    expect(screen.queryByAltText('Förhandsvisning av nytt plagg')).toBeNull()
    scanObjectBankPhoto.mockResolvedValue({ ok: true, result: { verdict: 'reject', reason: 'person' } })
    await choosePhoto()
    await screen.findByText(/Bilden avvisades/)
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
  it('aborts on unmount and ignores late approval', async () => {
    let resolve
    scanObjectBankPhoto.mockImplementation(() => new Promise((done) => { resolve = done }))
    const onAdd = vi.fn()
    const view = render(<WardrobeGarmentForm onAdd={onAdd} />)
    consent(); await choosePhoto()
    await waitFor(() => expect(scanObjectBankPhoto).toHaveBeenCalledTimes(1))
    const signal = scanObjectBankPhoto.mock.calls[0][0].signal
    view.unmount(); expect(signal.aborted).toBe(true)
    await act(async () => resolve({ ok: true, result: review }))
    expect(onAdd).not.toHaveBeenCalled()
  })
})
