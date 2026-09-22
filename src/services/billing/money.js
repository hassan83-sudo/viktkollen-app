const MINOR_PER_MAJOR = {
  EUR: 100,
  SEK: 100,
  USD: 100,
}

export function assertCurrency(currency) {
  const code = String(currency || '').toUpperCase()
  if (!MINOR_PER_MAJOR[code]) {
    const error = new Error('unsupported_currency')
    error.code = 'unsupported_currency'
    throw error
  }
  return code
}

export function minorUnitsPerMajor(currency) {
  return MINOR_PER_MAJOR[assertCurrency(currency)]
}

/** Round half away from zero to an integer minor unit. */
export function roundHalfAwayFromZero(value) {
  if (!Number.isFinite(value)) return 0
  return value >= 0 ? Math.round(value) : -Math.round(-value)
}

/**
 * costMinor = round(quantity * priceMinor / perQuantity)
 * All inputs are integers. perQuantity defaults to 1 (price is per unit).
 */
export function multiplyMinorCost(quantity, priceMinor, perQuantity = 1) {
  const qty = Number(quantity)
  const price = Number(priceMinor)
  const scale = Number(perQuantity)

  if (!Number.isInteger(qty) || qty < 0) {
    const error = new Error('invalid_quantity')
    error.code = 'invalid_quantity'
    throw error
  }
  if (!Number.isInteger(price) || price < 0) {
    const error = new Error('invalid_price')
    error.code = 'invalid_price'
    throw error
  }
  if (!Number.isInteger(scale) || scale <= 0) {
    const error = new Error('invalid_price_scale')
    error.code = 'invalid_price_scale'
    throw error
  }

  const numerator = BigInt(qty) * BigInt(price)
  const denominator = BigInt(scale)
  const half = denominator / 2n
  return Number((numerator + half) / denominator)
}

/**
 * Convert minor units of `fromCurrency` into SEK öre using an explicit rate:
 * `sekOrePerMajorFrom` = öre per 1 major unit of the source currency
 * (e.g. 1050 means 1 USD = 10.50 SEK).
 */
export function convertMinorToSekOre(amountMinor, fromCurrency, sekOrePerMajorFrom) {
  const currency = assertCurrency(fromCurrency)
  const amount = Number(amountMinor)
  const rate = Number(sekOrePerMajorFrom)

  if (!Number.isInteger(amount) || amount < 0) {
    const error = new Error('invalid_amount')
    error.code = 'invalid_amount'
    throw error
  }
  if (!Number.isInteger(rate) || rate < 0) {
    const error = new Error('invalid_fx_rate')
    error.code = 'invalid_fx_rate'
    throw error
  }
  if (currency === 'SEK') return amount

  const sourceMinorPerMajor = BigInt(minorUnitsPerMajor(currency))
  return Number((BigInt(amount) * BigInt(rate) + sourceMinorPerMajor / 2n) / sourceMinorPerMajor)
}
