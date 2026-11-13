import { describe, expect, it, vi } from 'vitest'
import { callOpenAiJson, openAiGatewayInternals } from './openaiGateway.js'

function sseChunk(events) {
  return events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('')
}

describe('openaiGateway streaming nutrition text', () => {
  it('accumulates output_text deltas and invokes onTextDelta without a second request', async () => {
    const deltas = []
    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(sseChunk([
          { type: 'response.output_text.delta', delta: '{"items":[{"name":"Kyckling"' },
          { type: 'response.output_text.delta', delta: ',"bank":"Kyckling"},{"name":"Ris"}]}' },
          { type: 'response.completed', response: { output_text: '{"items":[{"name":"Kyckling","bank":"Kyckling"},{"name":"Ris"}]}', usage: { input_tokens: 10, output_tokens: 5 } } },
        ])))
        controller.close()
      },
    })
    const fetchImpl = vi.fn(async () => ({
      body,
      ok: true,
      status: 200,
      statusText: 'OK',
    }))

    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'test-key' },
      feature: 'food.scan',
      fetchImpl,
      input: [{ content: [{ text: 'test', type: 'input_text' }], role: 'user' }],
      onTextDelta: async (text) => { deltas.push(text) },
      type: 'photo',
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.value.items.map((item) => item.name)).toEqual(['Kyckling', 'Ris'])
    expect(deltas.at(-1)).toContain('Ris')
    expect(openAiGatewayInternals.appendStreamTextDelta(
      { type: 'response.output_text.delta', delta: 'abc' },
      'x',
    )).toBe('xabc')
  })
})
