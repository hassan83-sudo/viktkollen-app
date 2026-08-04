import {
  getAdaptiveCoachFeedback,
  getCheckIn,
  getGoalsHabits,
  getMeals,
  getProfile,
  getRemindersV2,
  getWeights,
  saveAdaptiveCoachFeedback,
  saveCheckIn,
  saveGoalsHabits,
  saveMeals,
  saveProfile,
  saveRemindersV2,
  saveWeights,
} from '../userDataRepository.js'

export const releaseAcceptanceFixtureDate = '2026-08-04'
export const releaseAcceptanceTestMarker = 'TESTDATA_RELEASE_ACCEPTANCE_V1'

function assertDevelopmentMode(mode = import.meta.env.MODE) {
  if (mode === 'production') {
    throw new Error('Release acceptance fixtures are development/test only.')
  }
}

function withMarker(record, label) {
  return {
    ...record,
    acceptanceLabel: label,
    fixture: true,
    source: releaseAcceptanceTestMarker,
    testMarker: releaseAcceptanceTestMarker,
  }
}

export function createReleaseAcceptanceFixtureData({
  fixtureDate = releaseAcceptanceFixtureDate,
  mode = import.meta.env.MODE,
} = {}) {
  assertDevelopmentMode(mode)

  return {
    adaptiveCoachFeedback: {
      actions: [
        withMarker({
          createdAt: `${fixtureDate}T08:20:00.000Z`,
          id: 'testdata-coach-action-protein',
          recommendationId: 'testdata-protein-focus',
          status: 'accepted',
          updatedAt: `${fixtureDate}T08:20:00.000Z`,
        }, 'TESTDATA coach action'),
      ],
    },
    checkIn: {
      [fixtureDate]: withMarker({
        date: fixtureDate,
        energy: 7,
        mood: 'Fokuserad',
        sleepHours: 7,
        steps: 7200,
        workout: { completed: true, type: 'promenad' },
      }, 'TESTDATA check-in'),
    },
    goalsHabits: {
      habits: [
        withMarker({
          active: true,
          createdAt: `${fixtureDate}T08:00:00.000Z`,
          id: 'testdata-habit-water',
          name: 'TESTDATA vattenvana',
          targetPerWeek: 5,
        }, 'TESTDATA habit'),
      ],
      goals: [
        withMarker({
          createdAt: `${fixtureDate}T08:00:00.000Z`,
          id: 'testdata-goal-protein',
          name: 'TESTDATA proteinmal',
          type: 'nutrition',
        }, 'TESTDATA goal'),
      ],
    },
    meals: [
      withMarker({
        calories: 430,
        carbs: 48,
        date: fixtureDate,
        fat: 12,
        fiber: 7,
        id: 'testdata-meal-lunch',
        protein: 38,
        text: 'TESTDATA kyckling, ris och broccoli',
        time: '12:15',
        type: 'Lunch',
      }, 'TESTDATA meal'),
    ],
    profile: withMarker({
      goal: 'ga ner i vikt',
      goalWeight: 78,
      name: 'TESTDATA User',
    }, 'TESTDATA profile'),
    remindersV2: {
      items: [
        withMarker({
          enabled: true,
          id: 'testdata-reminder-lunch',
          label: 'TESTDATA lunchreminder',
          time: '12:00',
          type: 'meal',
        }, 'TESTDATA reminder'),
      ],
    },
    weights: [
      withMarker({
        date: fixtureDate,
        id: 'testdata-weight-start',
        note: 'TESTDATA startvikt',
        source: 'manual',
        time: '08:00',
        value: 91.8,
      }, 'TESTDATA weight'),
      withMarker({
        date: fixtureDate,
        id: 'testdata-weight-current',
        note: 'TESTDATA aktuell vikt',
        source: 'manual',
        time: '08:05',
        value: 89.6,
      }, 'TESTDATA weight'),
    ],
  }
}

function isMarkedTestData(value) {
  if (!value || typeof value !== 'object') return false
  return value.testMarker === releaseAcceptanceTestMarker || value.source === releaseAcceptanceTestMarker
}

function removeMarkedFromArray(values) {
  return (Array.isArray(values) ? values : []).filter((item) => !isMarkedTestData(item))
}

function mergeUniqueById(current, fixtures) {
  const withoutFixtures = removeMarkedFromArray(current)
  return [...withoutFixtures, ...fixtures]
}

export function previewReleaseAcceptanceFixtureCleanup(snapshot = {}) {
  const counts = {
    adaptiveCoachActions: removeMarkedFromArray(snapshot.adaptiveCoachFeedback?.actions).length,
    checkIns: Object.values(snapshot.checkIn || {}).filter(isMarkedTestData).length,
    goals: removeMarkedFromArray(snapshot.goalsHabits?.goals).length,
    habits: removeMarkedFromArray(snapshot.goalsHabits?.habits).length,
    meals: removeMarkedFromArray(snapshot.meals).length,
    reminders: removeMarkedFromArray(snapshot.remindersV2?.items).length,
    weights: removeMarkedFromArray(snapshot.weights).length,
  }

  return {
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
  }
}

export function getCurrentFixtureSnapshot(repository = {
  getAdaptiveCoachFeedback,
  getCheckIn,
  getGoalsHabits,
  getMeals,
  getProfile,
  getRemindersV2,
  getWeights,
}) {
  return {
    adaptiveCoachFeedback: repository.getAdaptiveCoachFeedback({}),
    checkIn: repository.getCheckIn({}),
    goalsHabits: repository.getGoalsHabits({}),
    meals: repository.getMeals([]),
    profile: repository.getProfile(null),
    remindersV2: repository.getRemindersV2({}),
    weights: repository.getWeights([]),
  }
}

export function installReleaseAcceptanceFixtures({
  fixtureDate = releaseAcceptanceFixtureDate,
  mode = import.meta.env.MODE,
  repository = {
    getAdaptiveCoachFeedback,
    getCheckIn,
    getGoalsHabits,
    getMeals,
    getProfile,
    getRemindersV2,
    getWeights,
    saveAdaptiveCoachFeedback,
    saveCheckIn,
    saveGoalsHabits,
    saveMeals,
    saveProfile,
    saveRemindersV2,
    saveWeights,
  },
} = {}) {
  assertDevelopmentMode(mode)
  const fixtures = createReleaseAcceptanceFixtureData({ fixtureDate, mode })
  const snapshotBefore = getCurrentFixtureSnapshot(repository)

  repository.saveWeights(mergeUniqueById(snapshotBefore.weights, fixtures.weights))
  repository.saveMeals(mergeUniqueById(snapshotBefore.meals, fixtures.meals))
  repository.saveCheckIn({
    ...snapshotBefore.checkIn,
    [fixtureDate]: fixtures.checkIn[fixtureDate],
  })
  repository.saveGoalsHabits({
    ...snapshotBefore.goalsHabits,
    goals: mergeUniqueById(snapshotBefore.goalsHabits?.goals, fixtures.goalsHabits.goals),
    habits: mergeUniqueById(snapshotBefore.goalsHabits?.habits, fixtures.goalsHabits.habits),
  })
  repository.saveRemindersV2({
    ...snapshotBefore.remindersV2,
    items: mergeUniqueById(snapshotBefore.remindersV2?.items, fixtures.remindersV2.items),
  })
  repository.saveAdaptiveCoachFeedback({
    ...snapshotBefore.adaptiveCoachFeedback,
    actions: mergeUniqueById(snapshotBefore.adaptiveCoachFeedback?.actions, fixtures.adaptiveCoachFeedback.actions),
  })
  repository.saveProfile(fixtures.profile)

  return {
    fixtureDate,
    marker: releaseAcceptanceTestMarker,
    ok: true,
    snapshotBefore,
  }
}

export function cleanupReleaseAcceptanceFixtures({
  confirm = false,
  mode = import.meta.env.MODE,
  repository = {
    getAdaptiveCoachFeedback,
    getCheckIn,
    getGoalsHabits,
    getMeals,
    getRemindersV2,
    getWeights,
    saveAdaptiveCoachFeedback,
    saveCheckIn,
    saveGoalsHabits,
    saveMeals,
    saveRemindersV2,
    saveWeights,
  },
} = {}) {
  assertDevelopmentMode(mode)
  const snapshotBefore = getCurrentFixtureSnapshot(repository)
  const preview = previewReleaseAcceptanceFixtureCleanup(snapshotBefore)

  if (!confirm) {
    return {
      ok: false,
      preview,
      reason: 'Confirm krävs före cleanup.',
      snapshotBefore,
    }
  }

  const nextCheckIn = Object.fromEntries(
    Object.entries(snapshotBefore.checkIn || {}).filter(([, value]) => !isMarkedTestData(value)),
  )

  repository.saveWeights(removeMarkedFromArray(snapshotBefore.weights))
  repository.saveMeals(removeMarkedFromArray(snapshotBefore.meals))
  repository.saveCheckIn(nextCheckIn)
  repository.saveGoalsHabits({
    ...snapshotBefore.goalsHabits,
    goals: removeMarkedFromArray(snapshotBefore.goalsHabits?.goals),
    habits: removeMarkedFromArray(snapshotBefore.goalsHabits?.habits),
  })
  repository.saveRemindersV2({
    ...snapshotBefore.remindersV2,
    items: removeMarkedFromArray(snapshotBefore.remindersV2?.items),
  })
  repository.saveAdaptiveCoachFeedback({
    ...snapshotBefore.adaptiveCoachFeedback,
    actions: removeMarkedFromArray(snapshotBefore.adaptiveCoachFeedback?.actions),
  })

  return {
    ok: true,
    preview,
    snapshotBefore,
  }
}
