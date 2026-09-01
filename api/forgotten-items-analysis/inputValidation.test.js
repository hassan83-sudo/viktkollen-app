import { describe, expect, it } from 'vitest'

import { forgottenItemsRouteInternals } from './index.js'

const { isAllowedOrigin, parseRequestedItems, validateProviderPayload } = forgottenItemsRouteInternals

describe('api/forgotten-items-analysis isAllowedOrigin - exact hostname origin gate', () => {
  it('allows the exact Vercel origin', () => {
    expect(isAllowedOrigin('https://viktkollen.vercel.app', 'viktkollen.vercel.app')).toBe(true)
  })

  it('blocks a subdomain-suffix origin attack', () => {
    expect(isAllowedOrigin('https://viktkollen.vercel.app.attacker.example', 'viktkollen.vercel.app')).toBe(false)
  })

  it('blocks a malformed/non-URL origin', () => {
    expect(isAllowedOrigin('not-a-url', 'viktkollen.vercel.app')).toBe(false)
  })

  it('keeps the current behavior: a missing Origin is allowed through the gate', () => {
    expect(isAllowedOrigin('', 'viktkollen.vercel.app')).toBe(true)
    expect(isAllowedOrigin(undefined, 'viktkollen.vercel.app')).toBe(true)
  })

  it('keeps the current behavior: a missing VERCEL_URL disables the origin gate', () => {
    expect(isAllowedOrigin('https://evil.example', '')).toBe(true)
    expect(isAllowedOrigin('https://evil.example', undefined)).toBe(true)
  })
})

describe('api/forgotten-items-analysis parseRequestedItems - data integrity', () => {
  it('accepts a plain list of { id, label } entries', () => {
    const { items } = parseRequestedItems(JSON.stringify([{ id: 'phone', label: 'Mobil' }, { id: 'keys', label: 'Nycklar' }]))
    expect(items).toEqual([{ id: 'phone', label: 'Mobil' }, { id: 'keys', label: 'Nycklar' }])
  })

  it('rejects duplicate ids to avoid ambiguous result mapping', () => {
    const result = parseRequestedItems(JSON.stringify([{ id: 'phone', label: 'Mobil' }, { id: 'phone', label: 'Nycklar' }]))
    expect(result.error.code).toBe('invalidItems')
    expect(result.error.status).toBe(400)
  })

  it('rejects an id that collides with another entry positional fallback id', () => {
    const result = parseRequestedItems(JSON.stringify([{ id: 'item-1', label: 'Mobil' }, { label: 'Nycklar' }]))
    expect(result.error.code).toBe('invalidItems')
  })

  it('rejects invalid JSON, empty lists, non-arrays and empty labels', () => {
    expect(parseRequestedItems('not-json').error.code).toBe('invalidItems')
    expect(parseRequestedItems('[]').error.code).toBe('invalidItems')
    expect(parseRequestedItems('{}').error.code).toBe('invalidItems')
    expect(parseRequestedItems(JSON.stringify([{ id: 'phone', label: '   ' }])).error.code).toBe('invalidItems')
  })

  it('caps the list at MAX_ITEMS entries', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ id: `item-${index}`, label: `Sak ${index}` }))
    const { items } = parseRequestedItems(JSON.stringify(many))
    expect(items).toHaveLength(25)
  })
})

describe('api/forgotten-items-analysis validateProviderPayload - result mapping integrity', () => {
  it('maps the provider status array back onto the caller ids in order and normalizes unknown statuses', () => {
    const items = [{ id: 'phone', label: 'Mobil' }, { id: 'keys', label: 'Nycklar' }]
    const result = validateProviderPayload({ items: [{ status: 'identified' }, { status: 'garbage' }] }, items)
    expect(result.ok).toBe(true)
    expect(result.result.items).toEqual([
      { id: 'phone', status: 'identified' },
      { id: 'keys', status: 'not_confirmed' },
    ])
  })

  it('rejects a provider response whose item count does not match the request (fail-closed)', () => {
    const items = [{ id: 'phone', label: 'Mobil' }, { id: 'keys', label: 'Nycklar' }]
    expect(validateProviderPayload({ items: [{ status: 'identified' }] }, items).ok).toBe(false)
    expect(validateProviderPayload({}, items).ok).toBe(false)
    expect(validateProviderPayload({ items: 'not-an-array' }, items).ok).toBe(false)
  })
})