import { buildAdaptiveCoach } from '../adaptiveCoachEngine.js'
import { buildCoachActionSummary } from '../adaptiveCoachActions.js'
import { normalizeAdaptiveCoachFeedback } from '../adaptiveCoachFeedback.js'
import { buildAdaptiveCoachPatternSummary } from '../adaptiveCoachPatterns.js'
import { buildAdaptiveCoachStrategy } from '../adaptiveCoachStrategy.js'
import {
  coachFocusCategories,
  coachMemoryPolicyVersion,
  createCoachMemoryItemId,
  normalizeCoachMemory,
} from './coachMemoryModel.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function daysFromNow(dateText, nowText) {
  const date = new Date(dateText)
  const now = new Date(nowText)
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return Infinity
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000))
}

function addDaysIso(dateText, days) {
  const date = new Date(dateText)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function areaFrom(value) {
  const text = String(value || 'general').trim()
  return coachFocusCategories.includes(text) ? text : 'planning'
}

function countByArea(items, predicate) {
  const counts = new Map()
  safeArray(items).filter(predicate).forEach((item) => {
    const area = areaFrom(item.area || item.category)
    const current = counts.get(area) || { count: 0, latest: '' }
    counts.set(area, {
      count: current.count + 1,
      latest: item.updatedAt || item.completedAt || item.at || current.latest,
    })
  })
  return counts
}

function itemsFromCounts(counts, { evidenceType, lifecycle = 'created', min = 1, now, staleDays }) {
  return [...counts.entries()]
    .filter(([, value]) => value.count >= min)
    .map(([category, value]) => {
      const age = daysFromNow(value.latest || now, now)
      const recencyFactor = age > staleDays ? 0.35 : age > staleDays / 2 ? 0.55 : 0.8
      const confidence = Math.min(0.92, Math.max(0.25, (value.count / 4) * recencyFactor))
      return {
        category,
        confidence,
        evidenceCount: value.count,
        evidenceType,
        id: createCoachMemoryItemId(category, `${evidenceType}|${category}`),
        latestObservedDate: value.latest || now,
        lifecycle: age > staleDays ? 'stale' : lifecycle,
        source: 'derived',
        staleAfter: addDaysIso(value.latest || now, staleDays),
      }
    })
    .filter((item) => item.lifecycle !== 'stale')
    .sort((first, second) => second.confidence - first.confidence || first.category.localeCompare(second.category))
}

function buildActivePriorities(input, coachModel, strategyModel) {
  return [
    ...safeArray(coachModel.recommendations).map((item) => areaFrom(item.area)),
    ...safeArray(strategyModel.recommendations).map((item) => areaFrom(item.category)),
    ...safeArray(input.goalsHabits?.goals).map((item) => areaFrom(item.category || item.type)),
    ...safeArray(input.goalsHabits?.habits).map((item) => areaFrom(item.category || item.type)),
  ].filter((item, index, list) => item !== 'planning' || list.indexOf(item) === index).slice(0, 6)
}

function buildRecentContext({ actionSummary, coachModel, patternSummary, strategyModel }, now) {
  const staleAfter = addDaysIso(now, 14)
  return {
    activeActionCount: actionSummary.activeCount || actionSummary.total || 0,
    currentCoverage: Math.min(1, Math.max(0, coachModel.coverage?.ratio ?? 0)),
    currentMomentum: strategyModel.strategy || patternSummary.primaryPattern?.direction || 'insufficient',
    safeWeeklySummary: [
      coachModel.summary?.todayFocus,
      strategyModel.title,
      patternSummary.primaryPattern?.eligibility === 'supported' ? patternSummary.primaryPattern.category : '',
    ].filter(Boolean).join(' · ').slice(0, 180),
    staleAfter,
  }
}

export function buildCoachMemory(input = {}, options = {}) {
  const now = options.now || (options.analysisDate ? `${options.analysisDate}T12:00:00.000Z` : new Date().toISOString())
  const coachModel = options.coachModel || buildAdaptiveCoach(input, { analysisDate: options.analysisDate, now, period: options.period || '30d' })
  const patternSummary = options.patternSummary || buildAdaptiveCoachPatternSummary(input, { analysisDate: coachModel.analysisDate, days: 30, now })
  const strategyModel = options.strategyModel || buildAdaptiveCoachStrategy({ ...input, coachModel, patternSummary }, { analysisDate: coachModel.analysisDate, now, period: options.period || '30d' })
  const feedback = normalizeAdaptiveCoachFeedback(input.adaptiveCoachFeedback, { now })
  const actionSummary = buildCoachActionSummary(feedback)
  const completedCounts = countByArea(feedback.recommendations, (entry) =>
    entry.status === 'completed' || entry.lastActionStatus === 'completed' || entry.completionSource)
  const dismissedCounts = countByArea(feedback.history, (entry) => entry.status === 'dismissed')
  const barrierCounts = countByArea(feedback.history, (entry) => ['dismissed', 'postponed'].includes(entry.status))
  const existing = normalizeCoachMemory(feedback.coachMemory || input.coachMemory, { now })
  const successfulStrategies = itemsFromCounts(completedCounts, {
    evidenceType: 'verifiedOutcome',
    lifecycle: 'reinforced',
    min: 1,
    now,
    staleDays: 120,
  })
  const declinedStrategies = itemsFromCounts(dismissedCounts, {
    evidenceType: 'repeatedDismissal',
    lifecycle: 'weakened',
    min: 2,
    now,
    staleDays: 60,
  })
  const recurringBarriers = itemsFromCounts(barrierCounts, {
    evidenceType: 'repeatedFriction',
    lifecycle: 'created',
    min: 2,
    now,
    staleDays: 45,
  })

  return normalizeCoachMemory({
    ...existing,
    activePriorities: buildActivePriorities(input, coachModel, strategyModel),
    adaptationMetadata: {
      generatedAt: now,
      lastReviewedAt: existing.consent.memoryReviewedAt,
      memoryVersion: 1,
      sourceVersion: 'adaptiveCoachV8',
      staleAfter: addDaysIso(now, 14),
      userEdited: existing.adaptationMetadata.userEdited,
    },
    consent: {
      ...existing.consent,
      policyVersion: coachMemoryPolicyVersion,
    },
    declinedStrategies,
    preferences: existing.preferences,
    recentContext: buildRecentContext({ actionSummary, coachModel, patternSummary, strategyModel }, now),
    recurringBarriers,
    successfulStrategies,
  }, { now })
}

export function mergeCoachMemoryIntoFeedback(feedback = {}, memory = {}, options = {}) {
  const normalizedFeedback = normalizeAdaptiveCoachFeedback(feedback, options)
  return normalizeAdaptiveCoachFeedback({
    ...normalizedFeedback,
    coachMemory: normalizeCoachMemory(memory, options),
  }, options)
}

export const coachMemoryBuilderInternals = {
  addDaysIso,
  countByArea,
  daysFromNow,
}
