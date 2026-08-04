export const csvImportLimits = Object.freeze({
  maxRows: 2500,
  maxTextSizeBytes: 2 * 1024 * 1024,
})

const formulaPrefixPattern = /^[=+\-@\t\r]/

function getTextSizeBytes(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }

  return String(text || '').length
}

export function sanitizeCsvText(value) {
  const text = String(value ?? '').replace(/\0/g, '').trim()
  return formulaPrefixPattern.test(text) ? `'${text}` : text
}

export function detectCsvDelimiter(text) {
  const firstLine = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0] || ''
  const candidates = [',', ';', '\t']

  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length - 1,
    }))
    .sort((first, second) => second.count - first.count)[0]?.delimiter || ','
}

export function parseCsv(text, options = {}) {
  const source = String(text || '').replace(/^\uFEFF/, '')
  const limits = { ...csvImportLimits, ...(options.limits || {}) }

  if (!source.trim()) {
    return { errors: ['Filen är tom.'], headers: [], ok: false, rows: [], warnings: [] }
  }

  if (getTextSizeBytes(source) > limits.maxTextSizeBytes) {
    return { errors: ['CSV-filen är för stor för säker import.'], headers: [], ok: false, rows: [], warnings: [] }
  }

  const delimiter = options.delimiter || detectCsvDelimiter(source)
  const rows = []
  let current = ''
  let row = []
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (!quoted && char === delimiter) {
      row.push(sanitizeCsvText(current))
      current = ''
      continue
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1
      row.push(sanitizeCsvText(current))
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      current = ''
      continue
    }

    current += char
  }

  row.push(sanitizeCsvText(current))
  if (row.some((value) => value !== '')) rows.push(row)

  if (quoted) {
    return { errors: ['CSV-filen har ett citattecken som inte avslutas.'], headers: [], ok: false, rows: [], warnings: [] }
  }

  if (rows.length < 2) {
    return { errors: ['CSV-filen saknar datarader.'], headers: rows[0] || [], ok: false, rows: [], warnings: [] }
  }

  if (rows.length - 1 > limits.maxRows) {
    return { errors: ['CSV-filen innehåller för många rader.'], headers: [], ok: false, rows: [], warnings: [] }
  }

  const headers = rows[0].map((header) => header.toLocaleLowerCase('sv-SE').trim())
  const seen = new Set()
  const dataRows = rows.slice(1).map((values, index) => {
    const entry = headers.reduce((item, header, headerIndex) => ({
      ...item,
      [header]: values[headerIndex] ?? '',
    }), {})
    const signature = JSON.stringify(entry)
    const duplicate = seen.has(signature)
    seen.add(signature)
    return { duplicate, index: index + 2, values: entry }
  })

  return {
    delimiter,
    errors: [],
    headers,
    ok: true,
    rows: dataRows,
    warnings: dataRows.some((item) => item.duplicate) ? ['CSV-filen innehåller dubblettrader.'] : [],
  }
}

export const csvParserInternals = {
  formulaPrefixPattern,
  getTextSizeBytes,
}
