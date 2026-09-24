import axe from 'axe-core'

// A11Y-8F: axe-core for component tests (jsdom).
//
// jsdom has no layout or colour rendering, so axe reports colour contrast as
// "incomplete" here; contrast is checked in the browser suite (tests/a11y)
// and by the numeric contrast tests. Everything else (names, labels, ARIA,
// roles, dialogs, duplicate ids, list structure …) is checked for real.
//
// Blocking impacts: critical and serious. No rule is disabled.

export const blockingImpacts = ['critical', 'serious']

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

export async function runAxe(context = document.body) {
  const result = await axe.run(context, { resultTypes: ['violations'], runOnly: { type: 'tag', values: tags } })
  return result.violations
}

export function formatAxeViolations(violations) {
  return violations
    .map((violation) => `[${violation.impact}] ${violation.id}: ${violation.help}\n${violation.nodes.slice(0, 5).map((node) => `    ${node.target.join(' ')}`).join('\n')}`)
    .join('\n')
}

// Returns the blocking violations; tests assert on the returned list so the
// failure message names each rule and element.
export async function blockingAxeViolations(context = document.body) {
  const violations = await runAxe(context)
  return violations.filter((violation) => blockingImpacts.includes(violation.impact))
}
