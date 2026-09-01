import { describe, expect, it } from 'vitest'

import { forgottenItemsRouteInternals } from './index.js'

const { parseMultipart } = forgottenItemsRouteInternals

const boundary = 'test-boundary'

function textPart(name, value) {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    'latin1',
  )
}

function imagePart(name, fileName, contentType, bytes) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      'latin1',
    ),
    bytes,
    Buffer.from('\r\n', 'latin1'),
  ])
}

function closing() {
  return Buffer.from(`--${boundary}--\r\n`, 'latin1')
}

describe('api/forgotten-items-analysis parseMultipart - boundary-safe binary parsing', () => {
  it('does not truncate or alter image bytes that happen to contain the literal boundary text mid-stream, without CRLF framing', () => {
    // Deliberately embeds "--test-boundary" in the middle of the binary
    // payload, with ordinary bytes on both sides (no CRLF immediately
    // before it, no CRLF/"--" immediately after it) - i.e. it is NOT a
    // structurally valid delimiter line, only a coincidental byte match.
    // The old implementation split the whole request on this substring
    // wherever it occurred and silently cut the image short here.
    const prefix = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6])
    const embeddedBoundaryLookalike = Buffer.from(`--${boundary}`, 'latin1')
    const suffix = Buffer.from([7, 8, 9, 10, 11, 0xff, 0xd8, 0xff, 0xe0, 12, 13])
    const imageBytes = Buffer.concat([prefix, embeddedBoundaryLookalike, suffix])

    const body = Buffer.concat([
      imagePart('image', 'frame.png', 'image/png', imageBytes),
      closing(),
    ])

    const { files } = parseMultipart(body, boundary)

    expect(files.image).toBeDefined()
    expect(files.image.size).toBe(imageBytes.length)
    expect(Buffer.compare(files.image.data, imageBytes)).toBe(0)
  })

  it('reproduces the reported repro shape (a short image containing the embedded boundary text near its start) and now parses the full length unchanged', () => {
    // Mirrors the originally reported failure - a small binary payload
    // where the naive string-split parser found "--test-boundary" a few
    // bytes in and cut everything after it, shrinking the parsed image
    // (reported as "original: 27, parsed: 8").
    const imageBytes = Buffer.concat([
      Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x01, 0x02]),
      Buffer.from(`--${boundary}`, 'latin1'),
      Buffer.from([0x03, 0x04]),
    ])

    const body = Buffer.concat([
      imagePart('image', 'frame.png', 'image/png', imageBytes),
      closing(),
    ])

    const { files } = parseMultipart(body, boundary)

    expect(files.image.size).toBe(imageBytes.length)
    expect(files.image.data.length).toBe(imageBytes.length)
    expect(Buffer.compare(files.image.data, imageBytes)).toBe(0)
  })

  it('still treats a real, correctly CRLF-framed boundary line as a boundary (does not over-correct into never splitting)', () => {
    const imageBytes = Buffer.from([1, 2, 3, 4, 5])
    const body = Buffer.concat([
      textPart('items', '[{"id":"phone","label":"Mobil"}]'),
      imagePart('image', 'frame.png', 'image/png', imageBytes),
      closing(),
    ])

    const { fields, files } = parseMultipart(body, boundary)

    expect(fields.items).toBe('[{"id":"phone","label":"Mobil"}]')
    expect(Buffer.compare(files.image.data, imageBytes)).toBe(0)
    expect(files.image.contentType).toBe('image/png')
    expect(files.image.fileName).toBe('frame.png')
  })

  it('does not treat a boundary-like byte sequence as a delimiter when it is CRLF-preceded but not CRLF/"--"-terminated (malformed framing)', () => {
    // "--test-boundary" preceded by CRLF (looks line-start-ish) but
    // immediately followed by ordinary bytes rather than CRLF or "--" -
    // still not a structurally valid delimiter line, so it must stay
    // part of the file content.
    const imageBytes = Buffer.concat([
      Buffer.from([1, 2, 3]),
      Buffer.from('\r\n', 'latin1'),
      Buffer.from(`--${boundary}`, 'latin1'),
      Buffer.from([0x41, 0x42, 0x43]), // "ABC" - not CRLF, not "--"
      Buffer.from([4, 5, 6]),
    ])

    const body = Buffer.concat([
      imagePart('image', 'frame.png', 'image/png', imageBytes),
      closing(),
    ])

    const { files } = parseMultipart(body, boundary)

    expect(Buffer.compare(files.image.data, imageBytes)).toBe(0)
  })
})
