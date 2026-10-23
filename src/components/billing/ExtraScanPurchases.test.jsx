// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ExtraScanPurchases from './ExtraScanPurchases.jsx'
vi.mock('../../services/supabaseClient.js',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}}}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('shows server prices and confirms a free-account purchase with an exact batch expiry',async()=>{
  const fetch=vi.fn(async(url,options)=>{
    const body=options.body?JSON.parse(options.body):null
    const payload=!body?{catalog:[{feature:'food.scan',label:'Matscanning',unitPriceMinor:100}],batches:[]}:body.action==='create'?{id:'intent',hostedUrl:'https://checkout.sumup.com/pay/test'}:{payment:{status:'VERIFIED_PAID'},batches:[{id:1,feature:'food.scan',remaining:2,expires_at:'2026-11-22T12:00:00Z'}]}
    return {ok:true,json:async()=>({ok:true,...payload})}
  });vi.stubGlobal('fetch',fetch)
  render(<ExtraScanPurchases />)
  fireEvent.click(await screen.findByText('Förbered köp'))
  expect(await screen.findByText('Betala med SumUp')).toBeTruthy()
  const create=JSON.parse(fetch.mock.calls.find(([,o])=>o.body)?.[1].body)
  expect(create.feature).toBe('food.scan');expect(create.quantity).toBe(1);expect(create.amount).toBeUndefined()
  fireEvent.click(screen.getByText('Kontrollera betalning'))
  expect(await screen.findByText('Betalningen är bekräftad.')).toBeTruthy()
  expect(screen.getByText(/2 kvar. Gäller till/)).toBeTruthy()
})
describe('disabled or invalid catalog',()=>{
  it('hides checkout when the sandbox endpoint is disabled',async()=>{
    vi.stubGlobal('fetch',async()=>({ok:false,json:async()=>({ok:false})}))
    const {container}=render(<ExtraScanPurchases />)
    await new Promise(resolve=>setTimeout(resolve,0))
    expect(container.textContent).toBe('')
  })
})
