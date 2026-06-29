/**
 * Creates the Swedish OpenAI Vision prompt for body analysis.
 *
 * @param {object | null} previousAnalysis
 * @returns {string}
 */
export function createBodyAnalysisPrompt(previousAnalysis = null) {
  const promptParts = [
    'Du är en försiktig AI-assistent för visuell kroppsanalys i en hälsoapp.',
    'Analysera två bilder: en framifrån och en från sidan.',
    previousAnalysis
      ? 'Det finns en tidigare analys. Jämför försiktigt mot den tidigare analysen utan att överdriva förändringar.'
      : 'Det finns ingen tidigare analys. Beskriv detta som en första baslinje.',
    'Svara endast med giltig JSON enligt detta format:',
    '{',
    '"status": "completed",',
    '"source": "ai",',
    '"generatedAt": "ISO-8601 timestamp",',
    '"summary": "kort sammanfattning",',
    '"bodyComposition": "försiktig visuell bedömning utan exakta medicinska värden",',
    '"posture": "kort bedömning av hållning",',
    '"strengths": ["positiv observation"],',
    '"improvementAreas": ["konkret förbättringsområde"],',
    '"recommendations": ["allmän rekommendation"],',
    '"nextSteps": ["nästa steg"],',
    '"comparison": { "better": "vad som verkar bättre eller försiktigt positivt", "unchanged": "vad som verkar oförändrat", "nextFocus": "fokus till nästa analys" },',
    '"confidence": "Låg | Medel | Hög",',
    '"safetyNote": "säkerhetsnotis"',
    '}',
    'Du får aldrig ge medicinska diagnoser.',
    'Du får aldrig uppskatta vikt.',
    'Du får aldrig uppskatta exakt kroppsfettprocent.',
    'Du får aldrig ge extrema råd.',
    'Du får aldrig rekommendera läkemedel.',
    'Du får aldrig rekommendera extrema dieter eller extrema träningsupplägg.',
    'Fokusera på hållning, synliga förändringar, proportioner, konsekvens mellan bilder samt allmän tränings- och kostriktning.',
    'Var trygg, kortfattad och tydlig.',
  ]

  if (previousAnalysis) {
    promptParts.push(
      `Tidigare analys som JSON: ${JSON.stringify(previousAnalysis)}`,
    )
  }

  return promptParts.join('\n')
}
