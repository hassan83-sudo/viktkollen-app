const baseCompanionPolicy = Object.freeze({
  askListenOrHelp: true,
  escalateToAdult: true,
  neverHumanPretend: true,
  neverSecret: true,
  noDiagnosis: true,
  noRomanceMinors: true,
})

const levelPolicies = Object.freeze({
  preschool: {
    adultConfigured: true,
    companion: baseCompanionPolicy,
    iconScale: 1.35,
    pictureChecklist: true,
    readAloudOptional: true,
    shortCopy: true,
    tone: 'gentle',
  },
  f3: {
    adultConfigured: true,
    companion: baseCompanionPolicy,
    iconScale: 1.2,
    pictureChecklist: true,
    readAloudOptional: true,
    shortCopy: true,
    tone: 'encouraging',
  },
  mid46: {
    adultConfigured: false,
    companion: baseCompanionPolicy,
    iconScale: 1.05,
    pictureChecklist: false,
    readAloudOptional: true,
    shortCopy: false,
    tone: 'practical',
  },
  mid79: {
    adultConfigured: false,
    companion: baseCompanionPolicy,
    iconScale: 1,
    pictureChecklist: false,
    readAloudOptional: false,
    shortCopy: false,
    tone: 'planning',
  },
  highschool: {
    adultConfigured: false,
    companion: baseCompanionPolicy,
    iconScale: 1,
    pictureChecklist: false,
    readAloudOptional: false,
    shortCopy: false,
    tone: 'independent',
  },
})

export function getReadyLevelPolicy(levelId) {
  return levelPolicies[levelId] || levelPolicies.mid79
}

export function getCompanionSafetyPolicy(levelId) {
  return getReadyLevelPolicy(levelId).companion
}
