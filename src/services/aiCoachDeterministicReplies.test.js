import { describe, expect, it } from 'vitest'
import {
  buildAiCoachFacts,
  createDeterministicAiCoachReply,
} from './aiCoachDeterministicReplies.js'

const coachContext = {
  checkIn: {
    energy: 6,
    mood: 'Fokuserad',
    steps: 7200,
  },
  meals: [
    {
      date: new Date().toISOString().slice(0, 10),
      id: 'meal-1',
      name: 'Kyckling med ris',
      protein: 35,
    },
    {
      date: new Date().toISOString().slice(0, 10),
      id: 'meal-2',
      name: 'Kvarg och havregryn',
      protein: 25,
    },
  ],
  nutritionGoals: {
    protein: '108–144 g',
  },
  profile: {
    goalWeight: '78 kg',
    startWeight: '91,8 kg',
  },
  weights: [
    {
      date: '2026-07-01',
      id: 'start',
      value: 91.8,
    },
    {
      date: '2026-07-27',
      id: 'latest',
      value: 90.1,
    },
  ],
}

function reply(message, chatHistory = []) {
  return createDeterministicAiCoachReply({
    chatHistory,
    context: {
      ...coachContext,
      chatHistory,
    },
    message,
  })
}

function sentences(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

describe('AI Coach deterministic V3 regression', () => {
  it('builds shared weight facts from app data', () => {
    const facts = buildAiCoachFacts(coachContext)

    expect(facts.startWeight).toBe(91.8)
    expect(facts.latestWeight).toBe(90.1)
    expect(facts.goalWeight).toBe(78)
    expect(facts.weightLost).toBe(1.7)
    expect(facts.goalRemaining).toBe(12.1)
  })

  it('answers current weight from latest logged weight', () => {
    expect(reply('Hur mycket väger jag nu?')).toContain(
      'Din senaste registrerade vikt är 90,1 kg.',
    )
  })

  it('answers weight loss from startWeight minus latestWeight only', () => {
    const response = reply('Hur mycket har jag gått ner?')

    expect(response).toContain('Du har gått ner 1,7 kg sedan start.')
    expect(response).not.toContain('12,1 kg')
    expect(response).not.toContain('mål')
  })

  it('answers goal remaining from latestWeight minus goalWeight', () => {
    const response = reply('Hur mycket är kvar till mitt mål?')

    expect(response).toContain('Du har 12,1 kg kvar till ditt mål')
    expect(response).not.toContain('målvikt ännu')
    expect(response).not.toContain('saknar')
  })

  it('uses explicit weight for protein calculation', () => {
    expect(reply('Jag väger 82 kg, hur mycket protein behöver jag?')).toContain(
      'Vid 82 kg är cirka 98–131 g protein per dag',
    )
  })

  it('answers pizza as food advice instead of topic selection', () => {
    const response = reply('Jag åt pizza idag.')

    expect(response.toLocaleLowerCase('sv-SE')).toContain('pizza')
    expect(response).toContain('förstör inte dina framsteg')
    expect(response).not.toContain('Vill du att vi fokuserar')
  })

  it('answers bedtime eating with late meal advice', () => {
    const response = reply('Jag åt precis innan jag skulle sova.')

    expect(response).toContain('precis innan sömn')
    expect(response).toContain('kvällsmål')
  })

  it('answers healthy weight loss questions constructively', () => {
    const response = reply('Hur kan jag gå ner i vikt?')

    expect(response).toContain('Hälsosam viktnedgång')
    expect(response).toContain('måttligt underskott')
  })

  it('combines stress and short sleep advice', () => {
    const response = reply('Jag är stressad och sov 5 timmar.')

    expect(response).toContain('Jag hör dig')
    expect(response).toContain('5 timmar är kort sömn')
  })

  it('resolves pizza follow-up from recent user context', () => {
    const response = reply('Var det dumt?', [
      {
        role: 'user',
        text: 'Jag åt pizza.',
      },
    ])

    expect(response.toLocaleLowerCase('sv-SE')).toContain('pizza')
    expect(response).toContain('förstör inte dina framsteg')
    expect(response).not.toContain('Vill du att vi fokuserar')
  })

  it('explains previous assistant advice on clarify follow-up', () => {
    const response = reply('Kan du utveckla?', [
      {
        role: 'assistant',
        text: 'En pizza förstör inte dina framsteg. Fortsätt som vanligt vid nästa måltid och välj gärna protein och grönsaker.',
      },
    ])

    expect(response).toContain('pizzan inte nollställer något')
    expect(response).toContain('nästa val')
  })

  it('handles hello as smalltalk', () => {
    expect(reply('hej')).toContain('Hej.')
  })

  it('handles thanks as smalltalk', () => {
    expect(reply('tack')).toContain('Varsågod')
  })

  it('handles good night as smalltalk', () => {
    expect(reply('god natt')).toContain('God natt')
  })

  it('answers gym training intent', () => {
    const response = reply('gym')

    expect(response).toContain('På gymmet')
    expect(response).toContain('Protein efter passet')
  })

  it('answers walk training intent with step data', () => {
    const response = reply('promenad')

    expect(response).toContain('Promenad')
    expect(response).toContain('7')
    expect(response).toContain('steg')
  })

  it('answers chips and soda as specific food advice', () => {
    const response = reply('chips och läsk')

    expect(response).toContain('Godis, chips eller läsk')
    expect(response).toContain('blodsocker')
  })

  it('answers multi-intent questions without duplicate sentences', () => {
    const response = reply(
      'Hur mycket väger jag nu? Hur mycket har jag gått ner? Hur mycket är kvar till mitt mål? Jag väger 82 kg, hur mycket protein behöver jag? Jag åt pizza idag. Jag åt precis innan jag skulle sova. Hur kan jag gå ner i vikt? gym',
    )
    const responseSentences = sentences(response)

    expect(response).toContain('Din senaste registrerade vikt är 90,1 kg.')
    expect(response).toContain('Du har gått ner 1,7 kg sedan start.')
    expect(response).toContain('Du har 12,1 kg kvar till ditt mål')
    expect(response).toContain('Vid 82 kg är cirka 98–131 g protein per dag')
    expect(response.toLocaleLowerCase('sv-SE')).toContain('pizza')
    expect(response).toContain('precis innan sömn')
    expect(response).toContain('Hälsosam viktnedgång')
    expect(response).toContain('På gymmet')
    expect(new Set(responseSentences).size).toBe(responseSentences.length)
  })
})

describe('AI Coach Pro V4 regression', () => {
  it('handles weight gain without using goal remaining', () => {
    const response = createDeterministicAiCoachReply({
      context: {
        profile: { goalWeight: '78 kg', startWeight: '90 kg' },
        weights: [
          { date: '2026-07-01', id: 'w1', value: 90 },
          { date: '2026-07-27', id: 'w2', value: 91.2 },
        ],
      },
      message: 'Har jag gått upp?',
    })

    expect(response).toContain('1,2 kg över startvikten')
    expect(response).not.toContain('13,2 kg')
  })

  it('handles weight plateau questions', () => {
    const response = createDeterministicAiCoachReply({
      context: {
        profile: { goalWeight: '78 kg', startWeight: '91 kg' },
        weights: [
          { date: '2026-06-01', id: 'w1', value: 90.2 },
          { date: '2026-06-15', id: 'w2', value: 90.1 },
          { date: '2026-07-01', id: 'w3', value: 90.2 },
          { date: '2026-07-27', id: 'w4', value: 90.1 },
        ],
      },
      message: 'Varför står vikten still, är det viktplatå?',
    })

    expect(response).toContain('står ganska still')
  })

  it('creates a deterministic prognosis with enough weight data', () => {
    const response = createDeterministicAiCoachReply({
      context: {
        profile: { goalWeight: '88 kg', startWeight: '95 kg' },
        weights: [
          { date: '2026-06-01', id: 'w1', value: 95 },
          { date: '2026-06-15', id: 'w2', value: 94 },
          { date: '2026-07-01', id: 'w3', value: 93 },
          { date: '2026-07-27', id: 'w4', value: 92 },
        ],
      },
      message: 'När når jag målet?',
    })

    expect(response).toContain('trend')
    expect(response).toContain('uppskattning')
  })

  it('avoids prognosis with insufficient weight data', () => {
    const response = createDeterministicAiCoachReply({
      context: {
        profile: { goalWeight: '78 kg' },
        weights: [{ date: '2026-07-27', id: 'w1', value: 90.1 }],
      },
      message: 'När når jag målet?',
    })

    expect(response).toContain('inte göra en målprognos ännu')
  })

  it('uses low step data in step advice', () => {
    const response = createDeterministicAiCoachReply({
      context: { checkIn: { steps: 3000 } },
      message: 'Jag har bara gått 3000 steg, vad ska jag göra?',
    })

    expect(response).toContain('3 000 steg')
    expect(response).toContain('promenad')
  })

  it('handles poor sleep', () => {
    const response = reply('Jag sov dåligt.')

    expect(response).toContain('Sömn påverkar')
  })

  it('creates insight for several low energy days', () => {
    const response = createDeterministicAiCoachReply({
      context: {
        checkIns: [
          { energy: 3, steps: 7000 },
          { energy: 4, steps: 7200 },
          { energy: 2, steps: 7100 },
        ],
      },
      message: 'Ge mig en insikt.',
    })

    expect(response).toContain('låg energi')
    expect(response).toContain('Nästa steg')
  })

  it('handles lost motivation', () => {
    const response = reply('Jag har tappat motivationen.')

    expect(response).toContain('tappat riktningen')
  })

  it('handles overeating', () => {
    const response = reply('Jag åt för mycket.')

    expect(response).toContain('inte att du förstört något')
  })

  it('handles sweet cravings', () => {
    const response = reply('Jag är sötsugen.')

    expect(response).toContain('Sötsug')
    expect(response).toContain('mellanmål')
  })

  it('handles rest day questions', () => {
    const response = reply('Behöver jag vilodag?')

    expect(response).toContain('Vilodag')
  })

  it('handles sore muscles', () => {
    const response = reply('Jag har träningsvärk.')

    expect(response).toContain('Vilodag')
  })

  it('prioritizes combined sleep pizza and steps question', () => {
    const response = createDeterministicAiCoachReply({
      context: {
        checkIn: { energy: 5, steps: 3000 },
        nutritionGoals: { protein: '108–144 g' },
      },
      message: 'Jag sov bara fem timmar, åt pizza och har bara gått 3000 steg. Vad ska jag göra?',
    })

    expect(response).toContain('5 timmar är kort sömn')
    expect(response.toLocaleLowerCase('sv-SE')).toContain('pizza')
    expect(response).toContain('3 000 steg')
  })

  it('answers why follow-up from previous advice', () => {
    const response = reply('Varför?', [
      { role: 'assistant', text: 'Protein hjälper mättnad och gör det lättare att nå målet.' },
    ])

    expect(response).toContain('Jag menar')
  })

  it('answers example follow-up', () => {
    const response = reply('Ge ett exempel.', [
      { role: 'assistant', text: 'Planera ett lätt kvällsmål.' },
    ])

    expect(response).toContain('Ett konkret exempel')
  })

  it('resolves pronoun det from previous food topic', () => {
    const response = reply('det', [{ role: 'user', text: 'Jag åt pizza.' }])

    expect(response.toLocaleLowerCase('sv-SE')).toContain('pizza')
  })

  it('resolves pronoun den from previous food topic', () => {
    const response = reply('den', [{ role: 'user', text: 'Jag åt pizza.' }])

    expect(response.toLocaleLowerCase('sv-SE')).toContain('pizza')
  })

  it('resolves pronoun så from previous food topic', () => {
    const response = reply('så', [{ role: 'user', text: 'Jag åt pizza.' }])

    expect(response.toLocaleLowerCase('sv-SE')).toContain('pizza')
  })

  it('uses repetition protection for repeated pizza advice', () => {
    const response = reply('Jag åt pizza.', [
      {
        role: 'assistant',
        text: 'En pizza förstör inte dina framsteg. Fortsätt som vanligt vid nästa måltid och välj gärna protein och grönsaker.',
      },
    ])

    expect(response).toContain('Som vi var inne på tidigare')
  })

  it('handles missing profile without crashing', () => {
    const response = createDeterministicAiCoachReply({
      context: { weights: coachContext.weights },
      message: 'Hur mycket är kvar till mitt mål?',
    })

    expect(response).toContain('målvikt')
  })

  it('handles empty weight log', () => {
    const response = createDeterministicAiCoachReply({
      context: { weights: [] },
      message: 'Hur mycket väger jag nu?',
    })

    expect(response).toContain('ingen giltig vikt')
  })

  it('handles a single weight registration', () => {
    const response = createDeterministicAiCoachReply({
      context: { weights: [{ date: '2026-07-27', id: 'w1', value: 90.1 }] },
      message: 'Hur mycket har jag gått ner?',
    })

    expect(response).toContain('0 kg')
  })

  it('handles invalid values without unsafe output', () => {
    const response = createDeterministicAiCoachReply({
      context: {
        checkIn: { energy: 'x', steps: 'nope' },
        profile: { goalWeight: 'abc', startWeight: '' },
        weights: [{ date: 'fel', id: 'bad', value: 'nope' }],
      },
      message: 'Hur mycket väger jag nu? Hur mycket är kvar till mitt mål?',
    })

    expect(response).not.toMatch(/\b(?:NaN|undefined|null)\b/)
  })

  it('handles urgent safety intents', () => {
    const response = reply('Jag har bröstsmärta och svårt att andas.')

    expect(response).toContain('Kontakta vården direkt')
  })

  it('handles eating-disorder-like safety intents', () => {
    const response = reply('Jag vill kräkas efter mat.')

    expect(response).toContain('Jag vill inte hjälpa till')
  })

  it('keeps Swedish decimal comma formatting', () => {
    expect(reply('Hur mycket har jag gått ner?')).toContain('1,7 kg')
  })

  it('never returns unsafe placeholders in common replies', () => {
    const response = reply('Hej. Hur mycket väger jag nu? Jag åt chips och läsk. gym')

    expect(response).not.toMatch(/\b(?:NaN|undefined|null)\b/)
  })
})
