import { getIntentSourceText, isClarifyFollowUp } from './coachConversation.js'
import { addUnique, hasAnyTerm, includesAny, normalizeAiCoachText } from './coachText.js'

export const intentOrder = [
  'safety',
  'smalltalk',
  'weight',
  'loss',
  'weight_gain',
  'goal',
  'progress_dashboard',
  'prognosis',
  'plateau',
  'steps',
  'checkin',
  'today_food',
  'meal_memory',
  'nutrition_quality',
  'meal_generator',
  'recipe',
  'dietary_preferences',
  'meal_planner',
  'nutrition_recommendation',
  'monthly_nutrition',
  'weekly_nutrition',
  'protein',
  'calories',
  'food',
  'craving',
  'overeating',
  'late_meal',
  'healthy_loss',
  'meal',
  'training',
  'rest_day',
  'motivation',
  'stress',
  'sleep',
  'insight',
  'focus',
  'clarify',
]

const foodTerms = [
  'pizza',
  'hamburgare',
  'godis',
  'chips',
  'läsk',
  'kyckling',
  'ägg',
  'kvarg',
  'keso',
  'lax',
  'torsk',
  'tonfisk',
  'havregryn',
  'ris',
  'potatis',
  'pasta',
  'bröd',
  'mjölk',
  'ost',
  'pommes',
  'cola',
]

const plainFoodTerms = [
  'pizza',
  'hamburgare',
  'godis',
  'chips',
  'lask',
  'kyckling',
  'agg',
  'kvarg',
  'keso',
  'lax',
  'torsk',
  'tonfisk',
  'havregryn',
  'ris',
  'potatis',
  'pasta',
  'brod',
  'mjolk',
  'ost',
  'pommes',
  'cola',
]

function extractSleepHours(text) {
  const match = text.match(
    /(?:sov|sovit|sover|sova)\s+(?:bara\s+)?(\d{1,2}|fem|sex|sju|åtta|atta)(?:[,.]\d+)?\s*(?:tim|timmar|h)?/,
  )

  if (!match) {
    return null
  }

  const words = {
    atta: 8,
    fem: 5,
    sex: 6,
    sju: 7,
    åtta: 8,
  }

  return words[match[1]] ?? Number(match[1])
}

function isCurrentWeightQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur mycket väger jag',
    'vad väger jag',
    'min vikt',
    'aktuell vikt',
    'vikt nu',
    'vikt idag',
    'vikt i dag',
    'går det bra med vikten',
  ], [
    'hur mycket vager jag',
    'vad vager jag',
    'min vikt',
    'aktuell vikt',
    'vikt nu',
    'gar det bra med vikten',
  ])
}

function isWeightLossQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur mycket har jag gått ner',
    'hur mycket har jag gått ned',
    'gått ner',
    'gått ned',
    'minskat i vikt',
    'viktförändring',
  ], [
    'hur mycket har jag gatt ner',
    'gatt ner',
    'gatt ned',
    'minskat i vikt',
    'viktforandring',
  ])
}

function isWeightGainQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'har jag gått upp',
    'gått upp',
    'vikten hoppar upp',
  ], [
    'har jag gatt upp',
    'gatt upp',
    'vikten hoppar upp',
  ])
}

function isGoalQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur mycket är kvar till mitt mål',
    'hur långt har jag kvar',
    'hur mycket är kvar till mål',
    'kvar till mitt mål',
    'kvar till mål',
    'kvar till min målvikt',
  ], [
    'hur mycket ar kvar till mitt mal',
    'hur langt har jag kvar',
    'hur mycket ar kvar till mal',
    'kvar till mitt mal',
    'kvar till mal',
    'kvar till min malvikt',
  ])
}

function isPrognosisQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'när når jag målet',
    'prognos',
    'när är jag framme',
  ], [
    'nar nar jag malet',
    'prognos',
    'nar ar jag framme',
  ])
}

function isPlateauQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'varför står vikten still',
    'viktplatå',
    'platå',
    'vikten hoppar upp och ner',
    'inget händer',
  ], [
    'varfor star vikten still',
    'viktplata',
    'plata',
    'vikten hoppar upp och ner',
    'inget hander',
  ])
}

function isProteinQuestion(normalized, message) {
  return hasAnyTerm(normalized, [
    'hur många gram protein',
    'hur mycket protein',
    'protein behöver jag',
    'proteinbehov',
    'gram protein',
    'protein idag',
    'protein kvar',
    'proteinrik',
    'ätit tillräckligt',
    'protein',
  ], [
    'hur manga gram protein',
    'hur mycket protein',
    'protein behover jag',
    'proteinbehov',
    'gram protein',
    'protein idag',
    'protein kvar',
    'proteinrik',
    'atit tillrackligt',
    'protein',
  ]) || /(\d{2,3}(?:[,.]\d+)?)\s*(?:kg|kilo)/i.test(message) && normalized.plain.includes('protein')
}

function isCaloriesQuestion(normalized) {
  return hasAnyTerm(normalized, ['kalorier', 'kalorimål', 'kcal'], ['kalorier', 'kalorimal', 'kcal'])
}

function isStressStatement(normalized) {
  return hasAnyTerm(normalized, [
    'jag är stressad',
    'är stressad',
    'känner mig stressad',
    'stressad',
    'mycket stress',
  ], [
    'jag ar stressad',
    'ar stressad',
    'kanner mig stressad',
    'stressad',
    'mycket stress',
  ])
}

function isMotivationStatement(normalized) {
  return hasAnyTerm(normalized, [
    'tappat motivationen',
    'ingen motivation',
    'vill ge upp',
    'misslyckades',
    'misslyckats',
    'dålig dag',
    'dålig vecka',
    'åt för mycket',
    'ätit för mycket',
    'orkar inte',
    'gav upp',
    'känner mig dålig',
    'det går för långsamt',
    'jag börjar om på måndag',
  ], [
    'tappat motivationen',
    'ingen motivation',
    'vill ge upp',
    'misslyckades',
    'misslyckats',
    'dalig dag',
    'dalig vecka',
    'at for mycket',
    'atit for mycket',
    'orkar inte',
    'gav upp',
    'kanner mig dalig',
    'det gar for langsamt',
    'jag borjar om pa mandag',
  ])
}

function isSleepStatement(normalized) {
  return extractSleepHours(normalized.searchable) !== null ||
    hasAnyTerm(normalized, [
      'sov dåligt',
      'sov lite',
      'trött',
      'vaknar på natten',
      'kan inte somna',
      'sömn påverkar vikten',
      'träna sent',
    ], [
      'sov daligt',
      'sov lite',
      'trott',
      'vaknar pa natten',
      'kan inte somna',
      'somn paverkar vikten',
      'trana sent',
    ])
}

function isLateMealQuestion(normalized) {
  const hasTiming = hasAnyTerm(normalized, [
    'precis innan jag sover',
    'precis innan jag skulle sova',
    'innan jag sover',
    'innan jag skulle sova',
    'innan läggdags',
    'nära läggdags',
    'sent på kvällen',
    'äta sent',
    'äter sent',
    'mat före sömn',
    'mat före läggdags',
  ], [
    'precis innan jag sover',
    'precis innan jag skulle sova',
    'innan jag sover',
    'innan jag skulle sova',
    'innan laggdags',
    'nara laggdags',
    'sent pa kvallen',
    'ata sent',
    'ater sent',
    'mat fore somn',
    'mat fore laggdags',
  ])
  const hasFood = includesAny(normalized.plain, ['at', 'atit', 'ater', 'ata', 'mat', 'maltid'])

  return hasTiming && (hasFood || normalized.plain.includes('laggdags'))
}

function isHealthyWeightLossQuestion(normalized) {
  const asksLoss = hasAnyTerm(normalized, [
    'hur kan jag gå ner i vikt',
    'gå ner i vikt',
    'viktnedgång',
    'viktminskning',
  ], [
    'hur kan jag ga ner i vikt',
    'ga ner i vikt',
    'viktnedgang',
    'viktminskning',
  ])
  const asksHealthy = includesAny(normalized.plain, ['halsosamt', 'sunt', 'hallbart', 'sakert'])

  return asksLoss && (asksHealthy || normalized.plain.includes('hur kan jag ga ner i vikt'))
}

function isMealQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'vad ska jag äta',
    'vad ska jag äta ikväll',
    'middag',
    'middagen',
    'lunch',
    'lunchen',
    'frukost',
    'mellanmål',
    'portionsstorlek',
    'hur såg min lunch ut',
    'hur såg middagen ut',
  ], [
    'vad ska jag ata',
    'vad ska jag ata ikvall',
    'middag',
    'middagen',
    'lunch',
    'lunchen',
    'frukost',
    'mellanmal',
    'portionsstorlek',
    'hur sag min lunch ut',
    'hur sag middagen ut',
  ])
}

function isFoodStatement(normalized) {
  return hasAnyTerm(normalized, [
    'jag åt',
    'jag har ätit',
    'jag syndade',
    'jag fuskade',
    'förstörde dieten',
    'jag är hungrig',
    'sötsugen',
    'kvällssug',
    ...foodTerms,
  ], [
    'jag at',
    'jag har atit',
    'jag syndade',
    'jag fuskade',
    'forstorde dieten',
    'jag ar hungrig',
    'sotsugen',
    'kvallssug',
    ...plainFoodTerms,
  ])
}

function isCraving(normalized) {
  return hasAnyTerm(normalized, ['sötsugen', 'kvällssug', 'hungrig'], ['sotsugen', 'kvallssug', 'hungrig'])
}

function isOvereating(normalized) {
  return hasAnyTerm(normalized, ['åt för mycket', 'ätit för mycket', 'syndade', 'fuskade', 'förstörde dieten'], ['at for mycket', 'atit for mycket', 'syndade', 'fuskade', 'forstorde dieten'])
}

function isTrainingStatement(normalized) {
  return hasAnyTerm(normalized, [
    'ska jag träna idag',
    'jag orkar inte träna',
    'behöver jag vilodag',
    'träningsvärk',
    'promenad',
    'löpning',
    'gym',
    'styrketräning',
    'vilodag',
    'hiit',
    'cykling',
    'för lite rörelse',
    'hur många steg',
  ], [
    'ska jag trana idag',
    'jag orkar inte trana',
    'behover jag vilodag',
    'traningsvark',
    'promenad',
    'lopning',
    'gym',
    'styrketraning',
    'vilodag',
    'hiit',
    'cykling',
    'for lite rorelse',
    'hur manga steg',
  ])
}

function isRestDay(normalized) {
  return hasAnyTerm(normalized, ['vilodag', 'träningsvärk', 'orkar inte träna'], ['vilodag', 'traningsvark', 'orkar inte trana'])
}

function isStepsQuestion(normalized) {
  return hasAnyTerm(normalized, ['hur många steg', 'bara gått', 'för lite rörelse', 'rört mig tillräckligt', 'steg'], ['hur manga steg', 'bara gatt', 'for lite rorelse', 'rort mig tillrackligt', 'steg'])
}

function isCheckInQuestion(normalized) {
  return hasAnyTerm(normalized, ['hur mår jag idag', 'hur mår jag i dag', 'måendet idag', 'energi idag'], ['hur mar jag idag', 'hur mar jag i dag', 'maendet idag', 'energi idag'])
}

function isTodayFoodQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'vad har jag ätit idag',
    'vad har jag ätit i dag',
    'ätit idag',
    'ätit i dag',
    'protein har jag ätit idag',
    'protein har jag ätit i dag',
    'kalorier har jag fått i mig',
    'kalorier idag',
  ], [
    'vad har jag atit idag',
    'vad har jag atit i dag',
    'atit idag',
    'atit i dag',
    'protein har jag atit idag',
    'protein har jag atit i dag',
    'kalorier har jag fatt i mig',
    'kalorier idag',
  ])
}

function isMealMemoryQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'vad åt jag idag',
    'vad har jag ätit idag',
    'vad åt jag till lunch',
    'vad åt jag till frukost',
    'vad åt jag till middag',
    'vad åt jag till nattmål',
    'senaste måltid',
    'senaste maten',
    'hur många måltider har jag ätit idag',
    'hur många måltider',
    'vilken måltid innehöll mest protein',
    'måltid innehöll mest protein',
    'mest protein',
    'lunchen innehöll mer protein',
    'middagen var dagens största',
    'jämför mina måltider idag',
    'jämför mina måltider',
  ], [
    'vad at jag idag',
    'vad har jag atit idag',
    'vad at jag till lunch',
    'vad at jag till frukost',
    'vad at jag till middag',
    'vad at jag till nattmal',
    'senaste maltid',
    'senaste maten',
    'hur manga maltider har jag atit idag',
    'hur manga maltider',
    'vilken maltid inneholl mest protein',
    'maltid inneholl mest protein',
    'mest protein',
    'lunchen inneholl mer protein',
    'middagen var dagens storsta',
    'jamfor mina maltider idag',
    'jamfor mina maltider',
  ])
}

function isWeeklyNutritionQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur har min vecka sett ut',
    'denna vecka',
    'veckan',
    'förra veckan',
    'föregående vecka',
    'genomsnittliga protein',
    'genomsnittligt protein',
    'dagar nådde jag proteinmålet',
    'dagar registrerade jag mat',
    'vilken dag åt jag mest protein',
    'vilken dag åt jag flest kalorier',
    'hur skiljer sig denna vecka',
    'ätit regelbundet denna vecka',
    'måltidstyp registrerade jag oftast',
    'fokusera på nästa vecka',
  ], [
    'hur har min vecka sett ut',
    'denna vecka',
    'veckan',
    'forra veckan',
    'foregaende vecka',
    'genomsnittliga protein',
    'genomsnittligt protein',
    'dagar nadde jag proteinmalet',
    'dagar registrerade jag mat',
    'vilken dag at jag mest protein',
    'vilken dag at jag flest kalorier',
    'hur skiljer sig denna vecka',
    'atit regelbundet denna vecka',
    'maltidstyp registrerade jag oftast',
    'fokusera pa nasta vecka',
  ])
}

function isMonthlyNutritionQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur har min månad sett ut',
    'hur såg min månad ut',
    'denna månad',
    'månaden',
    'månadens',
    'förra månaden',
    'föregående månad',
    'genomsnittliga protein denna månad',
    'genomsnittligt protein denna månad',
    'dagar nådde jag proteinmålet denna månad',
    'dagar registrerade jag mat denna månad',
    'vilken vecka hade högst protein',
    'vilken dag hade mest protein denna månad',
    'hur skiljer sig denna månad',
    'vilken måltid åt jag oftast',
    'hur förändrades min vikt denna månad',
    'fokusera på nästa månad',
  ], [
    'hur har min manad sett ut',
    'hur sag min manad ut',
    'denna manad',
    'manaden',
    'manadens',
    'forra manaden',
    'foregaende manad',
    'genomsnittliga protein denna manad',
    'genomsnittligt protein denna manad',
    'dagar nadde jag proteinmalet denna manad',
    'dagar registrerade jag mat denna manad',
    'vilken vecka hade hogst protein',
    'vilken dag hade mest protein denna manad',
    'hur skiljer sig denna manad',
    'vilken maltid at jag oftast',
    'hur forandrades min vikt denna manad',
    'fokusera pa nasta manad',
  ])
}

function isNutritionQualityQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur säkra är dagens näringsvärden',
    'hur säkra är näringsvärdena',
    'vilka måltider behöver jag granska',
    'varför är kalorierna osäkra',
    'kalorierna osäkra',
    'måltider saknar mängder',
    'saknar mängder',
    'veckans dataunderlag',
    'månadens dataunderlag',
    'förbättra måltidsbeskrivningarna',
    'värden har jag korrigerat manuellt',
    'korrigerat manuellt',
    'hur många måltider kunde analyseras',
    'datakvalitet',
    'underlaget',
  ], [
    'hur sakra ar dagens naringsvarden',
    'hur sakra ar naringsvardena',
    'vilka maltider behover jag granska',
    'varfor ar kalorierna osakra',
    'kalorierna osakra',
    'maltider saknar mangder',
    'saknar mangder',
    'veckans dataunderlag',
    'manadens dataunderlag',
    'forbattra maltidsbeskrivningarna',
    'varden har jag korrigerat manuellt',
    'korrigerat manuellt',
    'hur manga maltider kunde analyseras',
    'datakvalitet',
    'underlaget',
  ])
}

function isNutritionRecommendationQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'vad bör jag fokusera på idag',
    'vad kan jag äta för att nå proteinmålet',
    'måltidsmall som passar',
    'vad är viktigast denna vecka',
    'vad kan jag förbättra nästa månad',
    'varför föreslår du detta',
    'vad återstår av mina mål',
    'behöver jag registrera mer data',
    'vilka rekommendationer har högst prioritet',
    'vilken rekommendation har högst prioritet',
    'rekommendation',
    'rekommendationer',
    'handlingsplan',
  ], [
    'vad bor jag fokusera pa idag',
    'vad kan jag ata for att na proteinmalet',
    'maltidsmall som passar',
    'vad ar viktigast denna vecka',
    'vad kan jag forbattra nasta manad',
    'varfor foreslar du detta',
    'vad aterstar av mina mal',
    'behover jag registrera mer data',
    'vilka rekommendationer har hogst prioritet',
    'vilken rekommendation har hogst prioritet',
    'rekommendation',
    'rekommendationer',
    'handlingsplan',
  ])
}

function isDietaryPreferencesQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'matpreferenser',
    'kostpreferenser',
    'mina matval',
    'vegetariska rekommendationer',
    'vegetariskt förslag',
    'veganskt proteinförslag',
    'veganska förslag',
    'utan laktos',
    'laktosfritt',
    'utan gluten',
    'glutenfritt',
    'halal',
    'vilka mallar passar mina matval',
    'måltidsmallar passar mina preferenser',
    'varför föreslår du inte min favoritmall',
    'varför föreslår du inte min mall',
    'vilka matvaror ska jag undvika',
    'ändra mina matpreferenser',
    'ändra matpreferenser',
    'allergi',
  ], [
    'matpreferenser',
    'kostpreferenser',
    'mina matval',
    'vegetariska rekommendationer',
    'vegetariskt forslag',
    'veganskt proteinforslag',
    'veganska forslag',
    'utan laktos',
    'laktosfritt',
    'utan gluten',
    'glutenfritt',
    'halal',
    'vilka mallar passar mina matval',
    'maltidsmallar passar mina preferenser',
    'varfor foreslar du inte min favoritmall',
    'varfor foreslar du inte min mall',
    'vilka matvaror ska jag undvika',
    'andra mina matpreferenser',
    'andra matpreferenser',
    'allergi',
  ])
}

function isRecipeQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'favoritrecept',
    'proteinrika recept',
    'proteinrikt recept',
    'vegetariska recept',
    'vegetariskt recept',
    'recept som matchar',
    'recept som passar',
    'mina recept',
    'vilka recept',
    'har jag något recept',
  ], [
    'favoritrecept',
    'proteinrika recept',
    'proteinrikt recept',
    'vegetariska recept',
    'vegetariskt recept',
    'recept som matchar',
    'recept som passar',
    'mina recept',
    'vilka recept',
    'har jag nagot recept',
  ])
}

function isMealGeneratorQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'ai-plan',
    'ai plan',
    'ai-genererad plan',
    'ai genererad plan',
    'ai-meny',
    'ai meny',
    'dagens ai-plan',
    'veckans ai-plan',
    'genererad måltidsplan',
    'varför valdes receptet',
    'varför valdes första',
    'varför valdes den',
    'vilka recept valdes',
    'protein i planen',
    'kalorier i planen',
    'hur följer planen målen',
  ], [
    'ai-plan',
    'ai plan',
    'ai-genererad plan',
    'ai genererad plan',
    'ai-meny',
    'ai meny',
    'dagens ai-plan',
    'veckans ai-plan',
    'genererad maltidsplan',
    'varfor valdes receptet',
    'varfor valdes forsta',
    'varfor valdes den',
    'vilka recept valdes',
    'protein i planen',
    'kalorier i planen',
    'hur foljer planen malen',
  ])
}

function isProgressDashboardQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'min utveckling',
    'mina framsteg',
    'framstegsinsikt',
    'viktigast just nu',
    'min vikttrend',
    'målprognos',
    'genomsnittliga protein',
    'mitt genomsnittliga protein',
    'kalorimåluppfyllelse',
    'hur ofta jag tränat',
    'hur ofta har jag tränat',
    'mina check-ins',
    'mina vanor',
    'föregående period',
    'skillnaden mellan denna',
  ], [
    'min utveckling',
    'mina framsteg',
    'framstegsinsikt',
    'viktigast just nu',
    'min vikttrend',
    'malprognos',
    'genomsnittliga protein',
    'mitt genomsnittliga protein',
    'kalorimaluppfyllelse',
    'hur ofta jag tranat',
    'hur ofta har jag tranat',
    'mina check-ins',
    'mina vanor',
    'foregaende period',
    'skillnaden mellan denna',
  ])
}

function isMealPlannerQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'vad har jag planerat denna vecka',
    'planerat denna vecka',
    'veckoplan',
    'veckoplanering',
    'planerade måltider',
    'planerat protein',
    'protein har jag planerat',
    'vilka dagar saknar planerade måltider',
    'når planen mitt proteinmål',
    'vilka måltider kan jag lägga till',
    'vilka måltidsmallar passar planen',
    'vad finns på inköpslistan',
    'inköpslistan',
    'vilka varor är inte markerade',
    'läggs planerade måltider till i min historik',
    'hur registrerar jag en planerad måltid',
  ], [
    'vad har jag planerat denna vecka',
    'planerat denna vecka',
    'veckoplan',
    'veckoplanering',
    'planerade maltider',
    'planerat protein',
    'protein har jag planerat',
    'vilka dagar saknar planerade maltider',
    'nar planen mitt proteinmal',
    'vilka maltider kan jag lagga till',
    'vilka maltidsmallar passar planen',
    'vad finns pa inkopslistan',
    'inkopslistan',
    'vilka varor ar inte markerade',
    'laggs planerade maltider till i min historik',
    'hur registrerar jag en planerad maltid',
  ])
}

function isFocusQuestion(normalized) {
  return hasAnyTerm(normalized, ['vad bör jag fokusera på idag', 'vad ska jag fokusera på idag', 'fokus idag'], ['vad bor jag fokusera pa idag', 'vad ska jag fokusera pa idag', 'fokus idag'])
}

function isSmalltalk(normalized) {
  return [
    'hej',
    'hejsan',
    'halla',
    'hallå',
    'god morgon',
    'god kvall',
    'god kväll',
    'god natt',
    'tack',
    'tackar',
    'okej',
    'ok',
    'toppen',
    'bra',
    'hur mar du',
  ].some((phrase) => normalized.plain === phrase)
}

function isSafetyIntent(normalized) {
  return hasAnyTerm(normalized, [
    'svimning',
    'svimmar',
    'bröstsmärta',
    'svårt att andas',
    'kraftig yrsel',
    'snabb ofrivillig viktnedgång',
    'sluta med läkemedel',
    'svälta mig',
    'vill svälta',
    'kräkas efter mat',
    'vill kräkas',
    'hetsäter och kompenserar',
  ], [
    'svimning',
    'svimmar',
    'brostsmarta',
    'svart att andas',
    'kraftig yrsel',
    'snabb ofrivillig viktnedgang',
    'sluta med lakemedel',
    'svalta mig',
    'vill svalta',
    'krakas efter mat',
    'vill krakas',
    'hetsater och kompenserar',
  ])
}

export function identifyAiCoachIntents({ message, chatHistory = [] }) {
  const sourceText = getIntentSourceText(message, chatHistory)
  const normalized = normalizeAiCoachText(sourceText)
  const currentNormalized = normalizeAiCoachText(message)
  const intents = []

  if (normalized.compact.length > 0 && normalized.compact.length <= 2) {
    return ['unclear']
  }

  if (isSafetyIntent(normalized)) {
    addUnique(intents, 'safety')
  }

  if (isSmalltalk(currentNormalized)) {
    addUnique(intents, 'smalltalk')
  }

  if (isClarifyFollowUp(currentNormalized)) {
    addUnique(intents, 'clarify')
    return intentOrder.filter((intent) => intents.includes(intent))
  }

  if (isCurrentWeightQuestion(normalized)) addUnique(intents, 'weight')
  if (isWeightLossQuestion(normalized)) addUnique(intents, 'loss')
  if (isWeightGainQuestion(normalized)) addUnique(intents, 'weight_gain')
  if (isGoalQuestion(normalized)) addUnique(intents, 'goal')
  if (isProgressDashboardQuestion(normalized)) addUnique(intents, 'progress_dashboard')
  if (isPrognosisQuestion(normalized)) addUnique(intents, 'prognosis')
  if (isPlateauQuestion(normalized)) addUnique(intents, 'plateau')
  if (isStepsQuestion(normalized)) addUnique(intents, 'steps')
  if (isCheckInQuestion(normalized)) addUnique(intents, 'checkin')
  const asksProtein = isProteinQuestion(normalized, sourceText)
  const asksCalories = isCaloriesQuestion(normalized)
  const asksMealMemory = isMealMemoryQuestion(normalized)

  if (isTodayFoodQuestion(normalized) && !asksProtein && !asksCalories) addUnique(intents, 'today_food')
  if (asksMealMemory && !asksCalories) addUnique(intents, 'meal_memory')
  if (isNutritionQualityQuestion(normalized)) addUnique(intents, 'nutrition_quality')
  if (isMealGeneratorQuestion(normalized)) addUnique(intents, 'meal_generator')
  if (isRecipeQuestion(normalized) && !intents.includes('meal_generator')) addUnique(intents, 'recipe')
  if (isDietaryPreferencesQuestion(normalized)) addUnique(intents, 'dietary_preferences')
  if (isMealPlannerQuestion(normalized)) addUnique(intents, 'meal_planner')
  if (isNutritionRecommendationQuestion(normalized)) addUnique(intents, 'nutrition_recommendation')
  if (isMonthlyNutritionQuestion(normalized)) addUnique(intents, 'monthly_nutrition')
  if (isWeeklyNutritionQuestion(normalized) && !intents.includes('monthly_nutrition')) addUnique(intents, 'weekly_nutrition')
  if (asksProtein && !asksMealMemory) addUnique(intents, 'protein')
  if (asksCalories) addUnique(intents, 'calories')

  const hasLateMealIntent = isLateMealQuestion(normalized)

  if (isOvereating(normalized)) addUnique(intents, 'overeating')
  if (isCraving(normalized)) addUnique(intents, 'craving')
  if (isFoodStatement(normalized) && (!hasLateMealIntent || normalized.plain.includes('pizza'))) addUnique(intents, 'food')
  if (hasLateMealIntent) addUnique(intents, 'late_meal')
  if (isHealthyWeightLossQuestion(normalized)) addUnique(intents, 'healthy_loss')
  if (isMealQuestion(normalized)) addUnique(intents, 'meal')
  if (isRestDay(normalized)) addUnique(intents, 'rest_day')
  if (isTrainingStatement(normalized)) addUnique(intents, 'training')
  if (isMotivationStatement(normalized)) addUnique(intents, 'motivation')
  if (isStressStatement(normalized)) addUnique(intents, 'stress')
  if (isSleepStatement(normalized) && !intents.includes('late_meal')) addUnique(intents, 'sleep')

  if (normalized.plain.includes('insikt') || normalized.plain.includes('analys')) {
    addUnique(intents, 'insight')
  }

  if (isFocusQuestion(normalized)) {
    addUnique(intents, 'focus')
  }

  return intentOrder.filter((intent) => intents.includes(intent))
}
