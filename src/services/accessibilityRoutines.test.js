/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addRoutine,
  maxRoutineNameLength,
  maxRoutineStepLength,
  maxRoutines,
  maxStepsPerRoutine,
  readRoutines,
  removeRoutine,
  routinesStorageKey,
  updateRoutine,
} from './accessibilityRoutines.js'

describe('accessibilityRoutines (A11Y-7F)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('documents conservative, exact limits', () => {
    expect(maxRoutines).toBe(10)
    expect(maxStepsPerRoutine).toBe(20)
    expect(maxRoutineNameLength).toBe(60)
    expect(maxRoutineStepLength).toBe(120)
  })

  it('uses a dedicated storage key, separate from preferences and AAC phrases', () => {
    expect(routinesStorageKey).toBe('viktkollen.accessibility.routines.v1')
    expect(routinesStorageKey).not.toBe('viktkollen.accessibility.preferences.v1')
    expect(routinesStorageKey).not.toBe('viktkollen.accessibility.communicationPhrases.v1')
  })

  it('starts empty when nothing is stored', () => {
    expect(readRoutines()).toEqual([])
  })

  it('adds a routine with trimmed name and steps', () => {
    const result = addRoutine({ name: '  Morgon  ', steps: [' Tvätta ansiktet ', 'Ät frukost'] })
    expect(result.error).toBeNull()
    expect(result.routine.name).toBe('Morgon')
    expect(result.routine.steps).toEqual(['Tvätta ansiktet', 'Ät frukost'])
    expect(readRoutines()).toHaveLength(1)
  })

  it('drops blank step rows but keeps valid ones', () => {
    const result = addRoutine({ name: 'Morgon', steps: ['Tvätta ansiktet', '   ', 'Ät frukost'] })
    expect(result.error).toBeNull()
    expect(result.routine.steps).toEqual(['Tvätta ansiktet', 'Ät frukost'])
  })

  it('blocks an empty routine name', () => {
    const result = addRoutine({ name: '', steps: ['Ett steg'] })
    expect(result.error).toBe('emptyName')
    expect(readRoutines()).toHaveLength(0)
  })

  it('blocks a whitespace-only routine name', () => {
    const result = addRoutine({ name: '   ', steps: ['Ett steg'] })
    expect(result.error).toBe('emptyName')
  })

  it('blocks a routine name over the length limit', () => {
    const result = addRoutine({ name: 'x'.repeat(maxRoutineNameLength + 1), steps: ['Ett steg'] })
    expect(result.error).toBe('nameTooLong')
  })

  it('blocks a routine with no valid steps', () => {
    const result = addRoutine({ name: 'Morgon', steps: [] })
    expect(result.error).toBe('emptySteps')
  })

  it('blocks a routine whose only step is blank', () => {
    const result = addRoutine({ name: 'Morgon', steps: ['   '] })
    expect(result.error).toBe('emptySteps')
  })

  it('blocks a step over the length limit', () => {
    const result = addRoutine({ name: 'Morgon', steps: ['x'.repeat(maxRoutineStepLength + 1)] })
    expect(result.error).toBe('stepTooLong')
  })

  it('blocks more steps than the per-routine limit', () => {
    const result = addRoutine({
      name: 'Morgon',
      steps: Array.from({ length: maxStepsPerRoutine + 1 }, (_, i) => `Steg ${i}`),
    })
    expect(result.error).toBe('tooManySteps')
  })

  it('accepts exactly the maximum number of steps', () => {
    const result = addRoutine({
      name: 'Morgon',
      steps: Array.from({ length: maxStepsPerRoutine }, (_, i) => `Steg ${i}`),
    })
    expect(result.error).toBeNull()
    expect(result.routine.steps).toHaveLength(maxStepsPerRoutine)
  })

  it('enforces the maximum number of saved routines', () => {
    for (let i = 0; i < maxRoutines; i += 1) addRoutine({ name: `Rutin ${i}`, steps: ['Ett steg'] })
    expect(readRoutines()).toHaveLength(maxRoutines)

    const result = addRoutine({ name: 'En rutin för mycket', steps: ['Ett steg'] })
    expect(result.error).toBe('limitReached')
    expect(readRoutines()).toHaveLength(maxRoutines)
  })

  it('updates an existing routine (name, steps, order)', () => {
    const { routine } = addRoutine({ name: 'Morgon', steps: ['A', 'B'] })
    const result = updateRoutine(routine.id, { name: 'Morgon (uppdaterad)', steps: ['B', 'A', 'C'] })

    expect(result.error).toBeNull()
    expect(result.routine.name).toBe('Morgon (uppdaterad)')
    expect(result.routine.steps).toEqual(['B', 'A', 'C'])
    expect(readRoutines()).toHaveLength(1)
    expect(readRoutines()[0].steps).toEqual(['B', 'A', 'C'])
  })

  it('validates an update the same way as a create', () => {
    const { routine } = addRoutine({ name: 'Morgon', steps: ['A'] })
    const result = updateRoutine(routine.id, { name: '', steps: ['A'] })
    expect(result.error).toBe('emptyName')
    expect(readRoutines()[0].name).toBe('Morgon')
  })

  it('reports notFound when updating a non-existent routine', () => {
    const result = updateRoutine('missing-id', { name: 'X', steps: ['A'] })
    expect(result.error).toBe('notFound')
  })

  it('removes a routine by id', () => {
    const { routine } = addRoutine({ name: 'Morgon', steps: ['A'] })
    addRoutine({ name: 'Kväll', steps: ['B'] })

    const next = removeRoutine(routine.id)
    expect(next).toHaveLength(1)
    expect(next[0].name).toBe('Kväll')
  })

  it('stays safe and returns an empty list on malformed JSON', () => {
    window.localStorage.setItem(routinesStorageKey, '{not valid json')
    expect(() => readRoutines()).not.toThrow()
    expect(readRoutines()).toEqual([])
  })

  it('stays safe when the stored value is the wrong type', () => {
    window.localStorage.setItem(routinesStorageKey, JSON.stringify({ not: 'an array' }))
    expect(readRoutines()).toEqual([])
  })

  it('filters out malformed routine items without crashing', () => {
    window.localStorage.setItem(routinesStorageKey, JSON.stringify([
      { id: 'ok-1', name: 'Giltig', steps: ['A'] },
      { id: '', name: 'Missing id', steps: ['A'] },
      { id: 'no-steps', name: 'X' },
      { id: 'empty-steps', name: 'X', steps: [] },
      { id: 'bad-step', name: 'X', steps: [123] },
      'not-an-object',
      null,
    ]))

    expect(() => readRoutines()).not.toThrow()
    const routines = readRoutines()
    expect(routines).toHaveLength(1)
    expect(routines[0].name).toBe('Giltig')
  })

  it('never stores diagnosis, medication, dose, treatment, or compliance fields', () => {
    const { routine } = addRoutine({ name: 'Morgon', steps: ['A'] })
    expect(Object.keys(routine).sort()).toEqual(['createdAt', 'id', 'name', 'steps'])
  })
})
