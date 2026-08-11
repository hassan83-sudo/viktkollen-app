export const defaultPremiumPricing = Object.freeze({
  subscription: Object.freeze({
    premiumPriceSek: 9,
  }),
  ai: Object.freeze({
    aiCoach: Object.freeze({
      estimatedInputTokensPerRequest: 1500,
      estimatedOutputTokensPerRequest: 300,
      model: 'configurable-text-model',
      pricePerMillionInputTokensUsd: 0.15,
      pricePerMillionOutputTokensUsd: 0.6,
    }),
    bodyScan: Object.freeze({
      estimatedImageInputCostUsd: 0.003,
      estimatedInputTokensPerScan: 1200,
      estimatedOutputTokensPerScan: 500,
      imagesPerScan: 3,
      model: 'configurable-vision-model',
      pricePerMillionInputTokensUsd: 0.15,
      pricePerMillionOutputTokensUsd: 0.6,
    }),
    nutritionPhoto: Object.freeze({
      estimatedImageInputCostUsd: 0.003,
      estimatedInputTokensPerAnalysis: 900,
      estimatedOutputTokensPerAnalysis: 350,
      imagesPerAnalysis: 1,
      model: 'configurable-vision-model',
      pricePerMillionInputTokensUsd: 0.15,
      pricePerMillionOutputTokensUsd: 0.6,
    }),
  }),
  voice: Object.freeze({
    browserSpeechRecognition: Object.freeze({
      costPerMinuteUsd: 0,
    }),
    browserSpeechSynthesis: Object.freeze({
      costPerCharacterUsd: 0,
    }),
    externalTranscription: Object.freeze({
      costPerMinuteUsd: 0.006,
      enabled: false,
      estimatedMinutesPerSession: 1,
    }),
    externalTts: Object.freeze({
      costPerCharacterUsd: 0.000015,
      enabled: false,
      estimatedCharactersPerReply: 600,
    }),
    realtimeVoice: Object.freeze({
      enabled: false,
      estimatedInputAudioUnitsPerSession: 1,
      estimatedOutputAudioUnitsPerSession: 1,
      inputAudioCostUsd: 0,
      outputAudioCostUsd: 0,
    }),
  }),
  infrastructure: Object.freeze({
    domainMonthlyEquivalentSek: 15,
    otherFixedMonthlySek: 0,
    supabaseMonthlySek: 0,
    vercelMonthlySek: 0,
  }),
  payments: Object.freeze({
    fixedFeeSek: 1,
    percentageFee: 0.029,
  }),
  exchange: Object.freeze({
    usdToSek: 10.5,
  }),
  actualMonthlySpendSek: Object.freeze({
    openAi: null,
    other: null,
    supabase: null,
    vercel: null,
  }),
  simulatorDefaults: Object.freeze({
    activeUsers: 100,
    averageUsageMultiplier: 1,
    premiumConversionRate: 0.15,
  }),
  scenarios: Object.freeze({
    growing: Object.freeze({
      activeUsers: 10000,
      label: 'Växande',
      premiumConversionRate: 0.2,
    }),
    large: Object.freeze({
      activeUsers: 50000,
      label: 'Stor',
      premiumConversionRate: 0.25,
    }),
    small: Object.freeze({
      activeUsers: 1000,
      label: 'Liten',
      premiumConversionRate: 0.15,
    }),
    test: Object.freeze({
      activeUsers: 100,
      label: 'Test',
      premiumConversionRate: 0.1,
    }),
  }),
  sensitivityPricesSek: Object.freeze([9, 19, 29, 49]),
})

export const premiumPricingLabels = Object.freeze({
  aiCoach: 'AI Coach',
  bodyScan: 'Body Scan',
  browserSpeechRecognition: 'Browser STT',
  browserSpeechSynthesis: 'Browser TTS',
  domainMonthlyEquivalentSek: 'Domän',
  externalTranscription: 'Extern transkribering',
  externalTts: 'Extern TTS',
  fixedFeeSek: 'Fast betalavgift',
  nutritionPhoto: 'Nutrition AI',
  otherFixedMonthlySek: 'Övrigt',
  percentageFee: 'Procentuell betalavgift',
  premiumPriceSek: 'Premiumpris per månad',
  realtimeVoice: 'Realtime voice',
  supabaseMonthlySek: 'Supabase',
  vercelMonthlySek: 'Vercel',
})
