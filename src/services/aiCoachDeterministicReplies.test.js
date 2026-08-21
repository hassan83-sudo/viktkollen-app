import { describe, expect, it } from 'vitest'
import {
  buildAiCoachFacts,
  createDeterministicAiCoachReply,
} from './aiCoachDeterministicReplies.js'
import {
  buildAiCoachAppContextFromData,
  buildAiCoachAppContextFromStorage,
  coachAppContextInternals,
  createDailyPriorityCoachAdvice,
  makePendingCoachChatHistory,
} from './aiCoach/coachAppContext.js'
import { createDashboardData } from './dashboardService.js'
import { getUnifiedWeightFacts } from './healthCalculations.js'
import { userDataKeys } from './userDataRepository.js'

const todayString = coachAppContextInternals.getLocalDateString()

const coachContext = {
  checkIn: {
    energy: 6,
    mood: 'Fokuserad',
    steps: 7200,
  },
  meals: [
    {
      date: todayString,
      id: 'meal-1',
      name: 'Kyckling med ris',
      protein: 35,
    },
    {
      date: todayString,
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
  it('uses conversation history so greeting fallback is not repeated', () => {
    const first = reply('Hej')
    const history = [
      { role: 'user', text: 'Hej' },
      { role: 'assistant', text: first },
    ]
    const second = reply('Hej', history)

    expect(first).toContain('Hur kan jag hjälpa dig idag?')
    expect(second).not.toContain('Hur kan jag hjälpa dig idag?')
    expect(second).toContain('Jag är kvar')
  })

  it('does not treat the pending greeting as a previous greeting', () => {
    const response = reply('Hej', [{ role: 'user', text: 'Hej' }])

    expect(response).toContain('Hur kan jag hjälpa dig idag?')
  })

  it('answers follow-up nutrition questions without repeating the greeting intro', () => {
    const greeting = reply('Hej')
    const response = reply('Hur mycket protein behöver jag?', [
      { role: 'user', text: 'Hej' },
      { role: 'assistant', text: greeting },
      { role: 'user', text: 'Hur mycket protein behöver jag?' },
    ])

    expect(response.toLocaleLowerCase('sv-SE')).toContain('protein')
    expect(response).not.toContain('Hur kan jag hjälpa dig idag?')
    expect(response).not.toContain('Vill du att vi fokuserar')
  })

  it('builds shared weight facts from app data', () => {
    const facts = buildAiCoachFacts(coachContext)

    expect(facts.startWeight).toBe(91.8)
    expect(facts.latestWeight).toBe(90.1)
    expect(facts.goalWeight).toBe(78)
    expect(facts.weightLost).toBe(1.7)
    expect(facts.goalRemaining).toBe(12.1)
  })

  it('can reuse the highest smart notification in recommendations', () => {
    const text = createDeterministicAiCoachReply({
      context: {
        checkIn: {},
        meals: [],
        nutritionGoals: {},
        profile: {},
        reminderState: {},
        weights: [],
      },
      message: 'Vilken rekommendation har högst prioritet idag?',
    })

    expect(text).toContain('I dag rekommenderar jag')
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
    const response = reply('hej')

    expect(response).toContain('Hej!')
    expect(response).toContain('Hur kan jag hjälpa dig idag?')
    expect(response).toContain('90,1')
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

function makeStorage(data = {}) {
  const values = new Map(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  )

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

const localStorageLikeData = {
  [userDataKeys.chat]: [
    { createdAt: '2026-07-27T08:00:00', role: 'assistant', text: 'Hej.' },
    { createdAt: '2026-07-27T08:01:00', role: 'user', text: 'Jag åt pizza.' },
    { createdAt: '2026-07-27T08:02:00', role: 'assistant', text: 'En pizza förstör inte dina framsteg.' },
  ],
  [userDataKeys.checkIn]: {
    date: todayString,
    energy: 6,
    mood: 'Fokuserad',
    sleep: 7,
    steps: 7200,
    workout: true,
  },
  [userDataKeys.meals]: [
    {
      date: todayString,
      id: 'today-meal',
      name: 'Kyckling med ris',
      protein: 35,
      time: '12:00',
      type: 'Lunch',
    },
    {
      date: '2999-01-01',
      id: 'future-meal',
      name: 'Framtidsmat',
      protein: 99,
    },
    {
      date: 'trasigt',
      id: 'broken-meal',
      name: 'Trasig måltid',
    },
  ],
  [userDataKeys.nutritionGoals]: {
    protein: '108–144 g',
  },
  [userDataKeys.profile]: {
    activityLevel: 'Medel',
    goalWeight: '78 kg',
    startWeight: '91,8 kg',
  },
  [userDataKeys.weights]: [
    { date: '2026-07-01', id: 'w1', value: 91.8 },
    { date: '2026-07-27', id: 'w2', value: 90.1 },
    { date: '2999-01-01', id: 'future-weight', value: 50 },
    { date: 'nope', id: 'bad-weight', value: 'NaN' },
  ],
}

describe('AI Coach Pro V5 app integration', () => {
  it('builds context from realistic localStorage data', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))
    const facts = buildAiCoachFacts(context)

    expect(facts.startWeight).toBe(91.8)
    expect(facts.latestWeight).toBe(90.1)
    expect(facts.goalWeight).toBe(78)
    expect(context.todayMeals).toHaveLength(1)
    expect(context.chatHistory.at(-1).text).toContain('pizza')
  })

  it('updates context after a new weight', () => {
    const initial = buildAiCoachAppContextFromData({
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights: localStorageLikeData[userDataKeys.weights].slice(0, 2),
    })
    const updated = buildAiCoachAppContextFromData({
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights: [
        ...localStorageLikeData[userDataKeys.weights].slice(0, 2),
        {
          date: todayString,
          id: 'w3',
          time: '23:00',
          value: 89.9,
        },
      ],
    })

    expect(buildAiCoachFacts(initial).latestWeight).toBe(90.1)
    expect(buildAiCoachFacts(updated).latestWeight).toBe(89.9)
  })

  it('updates context after changed goal weight', () => {
    const first = buildAiCoachFacts(buildAiCoachAppContextFromData({
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights: localStorageLikeData[userDataKeys.weights].slice(0, 2),
    }))
    const second = buildAiCoachFacts(buildAiCoachAppContextFromData({
      profile: { goalWeight: '75 kg', startWeight: '91,8 kg' },
      weights: localStorageLikeData[userDataKeys.weights].slice(0, 2),
    }))

    expect(first.goalRemaining).toBe(12.1)
    expect(second.goalRemaining).toBe(15.1)
  })

  it('filters todays meals correctly', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))

    expect(context.todayMeals.map((meal) => meal.name)).toEqual(['Kyckling med ris'])
  })

  it('ignores future meals', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))

    expect(context.meals.some((meal) => meal.name === 'Framtidsmat')).toBe(false)
  })

  it('ignores broken meal dates', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))

    expect(context.meals.some((meal) => meal.name === 'Trasig måltid')).toBe(false)
  })

  it('sorts chat messages chronologically', () => {
    const context = buildAiCoachAppContextFromData({
      chatHistory: [
        { createdAt: '2026-07-27T08:02:00', role: 'assistant', text: 'Sist' },
        { createdAt: '2026-07-27T08:01:00', role: 'user', text: 'Först' },
      ],
    })

    expect(context.chatHistory.map((message) => message.text)).toEqual(['Först', 'Sist'])
  })

  it('uses the latest 10 chat messages', () => {
    const context = buildAiCoachAppContextFromData({
      chatHistory: Array.from({ length: 12 }, (_, index) => ({
        createdAt: `2026-07-27T08:${String(index).padStart(2, '0')}:00`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: `Meddelande ${index}`,
      })),
    })

    expect(context.chatHistory).toHaveLength(10)
    expect(context.chatHistory[0].text).toBe('Meddelande 2')
  })

  it('does not let an old food topic override a new direct weight question', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))
    const response = createDeterministicAiCoachReply({
      chatHistory: context.chatHistory,
      context,
      message: 'Vad väger jag?',
    })

    expect(response).toContain('90,1 kg')
    expect(response.toLocaleLowerCase('sv-SE')).not.toContain('pizza')
  })

  it('uses latest relevant topic for pronouns', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))
    const response = createDeterministicAiCoachReply({
      chatHistory: context.chatHistory,
      context,
      message: 'Var det dumt?',
    })

    expect(response.toLocaleLowerCase('sv-SE')).toContain('pizza')
  })

  it('keeps coach and dashboard weight facts identical', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))
    const coachFacts = buildAiCoachFacts(context)
    const dashboard = createDashboardData({
      checkIn: context.checkIn,
      foods: context.foods,
      meals: context.meals,
      profile: context.profile,
      weights: context.weights,
    })
    const sharedFacts = getUnifiedWeightFacts({
      currentWeight: context.currentWeight,
      profile: context.profile,
      weights: context.weights,
    })

    expect(coachFacts.weightLost).toBe(sharedFacts.weightLost)
    expect(dashboard.goals.remaining).toBe(sharedFacts.goalRemaining)
  })

  it('does not crash on broken JSON', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage({
      [userDataKeys.profile]: '{broken json',
      [userDataKeys.weights]: '[nope',
    }))

    expect(context.weights).toEqual([])
  })

  it('does not crash on empty localStorage', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage({}))
    const response = createDeterministicAiCoachReply({
      context,
      message: 'Vad väger jag?',
    })

    expect(response).toContain('ingen giltig vikt')
  })

  it('does not show NaN from app context replies', () => {
    const response = createDeterministicAiCoachReply({
      context: buildAiCoachAppContextFromStorage(makeStorage({
        [userDataKeys.weights]: [{ date: 'bad', value: 'NaN' }],
      })),
      message: 'Vad väger jag?',
    })

    expect(response).not.toMatch(/NaN/)
  })

  it('does not show undefined from app context replies', () => {
    const response = createDeterministicAiCoachReply({
      context: buildAiCoachAppContextFromStorage(makeStorage({})),
      message: 'Hur mår jag idag?',
    })

    expect(response).not.toMatch(/undefined/)
  })

  it('does not show null from app context replies', () => {
    const response = createDeterministicAiCoachReply({
      context: buildAiCoachAppContextFromStorage(makeStorage({})),
      message: 'Hur mycket är kvar till mitt mål?',
    })

    expect(response).not.toMatch(/\bnull\b/)
  })

  it('creates daily priority advice from real data', () => {
    const advice = createDailyPriorityCoachAdvice(buildAiCoachAppContextFromData({
      checkIn: { energy: 2, sleep: 5, steps: 3200 },
      meals: [{ date: todayString, name: 'Ris', protein: 10 }],
      nutritionGoals: { protein: '108–144 g' },
    }))

    expect(advice[0].observation).toContain('sömn')
    expect(advice.length).toBeGreaterThan(0)
  })

  it('daily advice does not invent goals', () => {
    const advice = createDailyPriorityCoachAdvice(buildAiCoachAppContextFromData({
      checkIn: { steps: 3200 },
      meals: [{ date: todayString, name: 'Ris', protein: 10 }],
      nutritionGoals: {},
    }))

    expect(JSON.stringify(advice)).not.toContain('proteinmål')
  })

  it('prognosis updates after new weight', () => {
    const first = reply('När når jag målet?')
    const updated = createDeterministicAiCoachReply({
      context: buildAiCoachAppContextFromData({
        profile: { goalWeight: '88 kg', startWeight: '95 kg' },
        weights: [
          { date: '2026-06-01', id: 'w1', value: 95 },
          { date: '2026-06-15', id: 'w2', value: 94 },
          { date: '2026-07-01', id: 'w3', value: 93 },
          { date: '2026-07-27', id: 'w4', value: 91 },
        ],
      }),
      message: 'När når jag målet?',
    })

    expect(updated).not.toBe(first)
    expect(updated).toContain('uppskattning')
  })

  it('explicit weight in question does not mutate saved latest weight', () => {
    const context = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))
    const before = buildAiCoachFacts(context).latestWeight

    createDeterministicAiCoachReply({
      context,
      message: 'Jag väger 82 kg, hur mycket protein behöver jag?',
    })

    expect(buildAiCoachFacts(context).latestWeight).toBe(before)
  })

  it('includes the new user message in pending chat context', () => {
    const pending = makePendingCoachChatHistory([
      { createdAt: '2026-07-27T08:00:00', role: 'assistant', text: 'Hej.' },
    ], 'Jag åt pizza.', '2026-07-27T08:01:00')

    expect(pending.at(-1)).toMatchObject({
      role: 'user',
      text: 'Jag åt pizza.',
    })
  })

  it('does not duplicate an already pending user message', () => {
    const pending = makePendingCoachChatHistory([
      { createdAt: '2026-07-27T08:01:00', role: 'user', text: 'Jag åt pizza.' },
    ], 'Jag åt pizza.', '2026-07-27T08:01:00')

    expect(pending).toHaveLength(1)
  })

  it('does not use old topic after cleared chat', () => {
    const response = createDeterministicAiCoachReply({
      chatHistory: [],
      context: buildAiCoachAppContextFromData({ chatHistory: [] }),
      message: 'Var det dumt?',
    })

    expect(response.toLocaleLowerCase('sv-SE')).not.toContain('chips')
    expect(response.toLocaleLowerCase('sv-SE')).not.toContain('pizza')
  })

  it('prioritizes fresh React-state data over older storage-like data', () => {
    const storageContext = buildAiCoachAppContextFromStorage(makeStorage(localStorageLikeData))
    const stateContext = buildAiCoachAppContextFromData({
      ...localStorageLikeData,
      profile: { goalWeight: '78 kg', startWeight: '91,8 kg' },
      weights: [
        { date: '2026-07-01', id: 'w1', value: 91.8 },
        { date: todayString, id: 'fresh', value: 89.7 },
      ],
    })

    expect(buildAiCoachFacts(storageContext).latestWeight).toBe(90.1)
    expect(buildAiCoachFacts(stateContext).latestWeight).toBe(89.7)
  })

  it('keeps sleep context across two follow-up questions', () => {
    const firstUser = { createdAt: '2026-07-27T08:00:00', role: 'user', text: 'Jag sov fem timmar.' }
    const firstAssistant = {
      createdAt: '2026-07-27T08:01:00',
      role: 'assistant',
      text: createDeterministicAiCoachReply({
        chatHistory: [firstUser],
        context: buildAiCoachAppContextFromData({ chatHistory: [firstUser] }),
        message: firstUser.text,
      }),
    }
    const secondUser = { createdAt: '2026-07-27T08:02:00', role: 'user', text: 'Varför spelar det roll?' }
    const secondAssistantText = createDeterministicAiCoachReply({
      chatHistory: [firstUser, firstAssistant, secondUser],
      context: buildAiCoachAppContextFromData({ chatHistory: [firstUser, firstAssistant, secondUser] }),
      message: secondUser.text,
    })
    const thirdUser = { createdAt: '2026-07-27T08:03:00', role: 'user', text: 'Ge ett exempel.' }
    const thirdAssistantText = createDeterministicAiCoachReply({
      chatHistory: [firstUser, firstAssistant, secondUser, { role: 'assistant', text: secondAssistantText }, thirdUser],
      context: buildAiCoachAppContextFromData({
        chatHistory: [firstUser, firstAssistant, secondUser, { role: 'assistant', text: secondAssistantText }, thirdUser],
      }),
      message: thirdUser.text,
    })

    expect(secondAssistantText.toLocaleLowerCase('sv-SE')).toContain('sömn')
    expect(thirdAssistantText.toLocaleLowerCase('sv-SE')).toContain('sömn')
  })

  it('uses the later weight when two entries are on the same day', () => {
    const context = buildAiCoachAppContextFromData({
      weights: [
        { date: '2026-07-27', id: 'morning', time: '08:00', value: 90.5 },
        { date: '2026-07-27', id: 'evening', time: '21:00', value: 90.1 },
      ],
    }, { today: '2026-07-27' })

    expect(buildAiCoachFacts(context).latestWeight).toBe(90.1)
  })

  it('handles ISO UTC dates near midnight using local date logic', () => {
    const context = buildAiCoachAppContextFromData({
      meals: [
        { date: '2026-07-27T22:30:00.000Z', id: 'late', name: 'Kvarg', protein: 20 },
      ],
    }, { today: '2026-07-28' })

    expect(context.todayMeals.map((meal) => meal.name)).toEqual(['Kvarg'])
  })

  it('keeps invalid date entries out of normalized weights', () => {
    const weights = coachAppContextInternals.normalizeWeights([
      { date: 'invalid', id: 'bad', value: 90 },
      { date: '2026-07-27', id: 'good', value: 90.1 },
    ], '2026-07-27')

    expect(weights.map((entry) => entry.id)).toEqual(['good'])
  })
})
