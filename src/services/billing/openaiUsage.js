export function extractOpenAiUsage(data = {}) {
  const usage = data?.usage
  if (!usage || typeof usage !== 'object') {
    return {
      cached_tokens: 0,
      image_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      usage_basis: 'UNAVAILABLE',
    }
  }

  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens)
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens)
  const totalTokens = Number(usage.total_tokens)
  const cachedTokens = Number(usage.input_tokens_details?.cached_tokens ?? usage.cached_tokens)
  const imageTokens = Number(usage.input_tokens_details?.image_tokens ?? usage.image_tokens)
  const hasAny = [inputTokens, outputTokens, totalTokens].some((value) => Number.isFinite(value) && value > 0)

  return {
    cached_tokens: Number.isFinite(cachedTokens) && cachedTokens > 0 ? Math.floor(cachedTokens) : 0,
    image_tokens: Number.isFinite(imageTokens) && imageTokens > 0 ? Math.floor(imageTokens) : 0,
    input_tokens: Number.isFinite(inputTokens) && inputTokens > 0 ? Math.floor(inputTokens) : 0,
    output_tokens: Number.isFinite(outputTokens) && outputTokens > 0 ? Math.floor(outputTokens) : 0,
    total_tokens: Number.isFinite(totalTokens) && totalTokens > 0
      ? Math.floor(totalTokens)
      : (Number.isFinite(inputTokens) && Number.isFinite(outputTokens) ? Math.max(0, Math.floor(inputTokens) + Math.floor(outputTokens)) : 0),
    usage_basis: hasAny ? 'MEASURED' : 'UNAVAILABLE',
  }
}

export function defaultFeatureForGatewayType(type = 'coach') {
  if (type === 'photo') return 'food.scan'
  if (type === 'voice') return 'ai.voice.session'
  return 'ai.text.request'
}
