/**
 * Creates the temporary mock body analysis result used before OpenAI Vision.
 *
 * @returns {object}
 */
export function createMockAnalysis() {
  return {
    bodyComposition:
      'Visuell kroppssammansättning ser stabil ut. Bedömningen är försiktig och följer inte exakta medicinska värden.',
    confidence: 'Medel',
    generatedAt: new Date().toISOString(),
    improvementAreas: [
      'Fortsätt ta bilder med samma ljus och avstånd.',
      'Försök fotografera vid ungefär samma tid på dagen.',
    ],
    nextSteps: [
      'Ta nästa analys om ungefär 7 dagar.',
      'Registrera gärna vikten samma dag som du tar bilderna.',
    ],
    posture: 'Hållningen ser stabil ut i mock-bedömningen.',
    progressEstimate:
      'Förändringar följs bäst över flera analyser med samma fotokonsekvens.',
    recommendations: [
      'Behåll samma fotograferingsvinkel.',
      'Fokusera på jämna veckovisa förändringar.',
      'Fortsätt med hållbara kost- och träningsvanor.',
    ],
    safetyNote:
      'Detta är en visuell uppskattning och inte medicinsk rådgivning, diagnos eller behandling.',
    status: 'mock',
    strengths: [
      'Du har laddat upp bilder från två vinklar.',
      'Det ger en bättre grund för jämförelser över tid.',
    ],
    summary:
      'Analysen är klar. Resultatet är en försiktig visuell uppskattning som främst ska användas för att följa utveckling över tid.',
  }
}
