const resultKeys = [
  'status',
  'generatedAt',
  'summary',
  'bodyComposition',
  'posture',
  'strengths',
  'improvementAreas',
  'progressEstimate',
  'confidence',
  'recommendations',
  'nextSteps',
  'safetyNote',
]

/**
 * Formats any body analysis result into the shared result model.
 *
 * @param {Record<string, unknown>} analysis
 * @returns {Record<string, unknown>}
 */
export function formatBodyAnalysisResult(analysis) {
  return resultKeys.reduce((result, key) => {
    if (analysis[key] !== undefined && analysis[key] !== null) {
      result[key] = analysis[key]
    }

    return result
  }, {})
}
