/**
 * Creates the temporary mock body analysis result used before OpenAI Vision.
 *
 * @param {object | null} previousAnalysis
 * @returns {object}
 */
export function createMockAnalysis(previousAnalysis = null) {
  return {
    bodyComposition:
      'Visuell kroppssammansättning ser stabil ut. Bedömningen är försiktig och följer inte exakta medicinska värden.',
    comparison: previousAnalysis
      ? {
          better:
            'Bilderna ger en ny jämförelsepunkt, men mockläget gör inga säkra visuella förändringspåståenden.',
          nextFocus:
            'Fortsätt med samma ljus, vinkel och avstånd till nästa analys.',
          unchanged:
            'Hållning och fotokonsekvens följs vidare över tid.',
        }
      : {
          better: 'Det här är din första analys.',
          nextFocus:
            'Skapa en ny analys om ungefär en vecka för att kunna jämföra.',
          unchanged: 'Ingen tidigare analys finns att jämföra med ännu.',
        },
    confidence: 'Medel',
    confidenceLevel: 'Medel',
    generatedAt: new Date().toISOString(),
    improvementAreas: [
      'Fortsätt ta bilder med samma ljus och avstånd.',
      'Försök fotografera vid ungefär samma tid på dagen.',
    ],
    limitations: [
      'Mockresultatet bygger inte på riktig bildtolkning.',
      'Resultatet ska inte användas som medicinsk bedömning.',
    ],
    monthlyFocus:
      'Fokusera på konsekventa bilder och hållbara rutiner under månaden.',
    nextSteps: [
      'Ta nästa analys om ungefär 7 dagar.',
      'Registrera gärna vikten samma dag som du tar bilderna.',
    ],
    posture: 'Hållningen ser stabil ut i mock-bedömningen.',
    progressEstimate:
      'Förändringar följs bäst över flera analyser med samma fotokonsekvens.',
    progressSummary:
      'Utvecklingen följs bäst genom flera analyser tagna under liknande förhållanden.',
    recommendations: [
      'Behåll samma fotograferingsvinkel.',
      'Fokusera på jämna veckovisa förändringar.',
      'Fortsätt med hållbara kost- och träningsvanor.',
    ],
    routineFeedback:
      'Din rutin blir mer användbar om bilderna tas regelbundet och på samma sätt.',
    safetyNote:
      'Detta är en visuell uppskattning och inte medicinsk rådgivning, diagnos eller behandling.',
    source: 'mock',
    sourceReason:
      'Mockresultat visas eftersom AI inte kunde användas eller inte är tillgängligt just nu.',
    status: 'completed',
    strengths: [
      'Du har laddat upp bilder från två vinklar.',
      'Det ger en bättre grund för jämförelser över tid.',
    ],
    summary:
      'Analysen är klar. Resultatet är en försiktig visuell uppskattning som främst ska användas för att följa utveckling över tid.',
    visualConsistency:
      'Försök hålla ljus, avstånd, vinkel och kläder så lika som möjligt.',
  }
}
