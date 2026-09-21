export const USAGE_EVENT_TYPES = Object.freeze([
  'ai.text.request',
  'ai.voice.session',
  'tts.request',
  'food.scan',
  'ai.eye.analysis',
  'ai.ear.interpret',
  'body.scan',
  'gps.live.session',
])

export const USAGE_UNITS = Object.freeze([
  'requests',
  'tokens',
  'seconds',
  'images',
  'sessions',
  'writes',
  'reads',
])

export const USAGE_BASIS = Object.freeze(['MEASURED', 'ESTIMATED', 'UNAVAILABLE'])
export const COST_BASIS = Object.freeze(['ESTIMATED', 'UNAVAILABLE'])

export const USAGE_METADATA_ALLOWLIST = Object.freeze([
  'cached_tokens',
  'image_count',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'usage_basis',
])

export const SENSITIVE_USAGE_FIELDS = Object.freeze([
  'api_key',
  'audio',
  'audio_url',
  'card_number',
  'coordinates',
  'cvv',
  'image',
  'image_hash',
  'image_url',
  'latitude',
  'longitude',
  'password',
  'prompt',
  'response',
  'transcript',
])

export const SUPPORTED_CURRENCIES = Object.freeze(['SEK', 'USD', 'EUR'])
export const CATALOG_STATUS = Object.freeze(['UNCONFIGURED', 'UNKNOWN', 'CONFIGURED'])
