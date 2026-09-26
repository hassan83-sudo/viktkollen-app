import { expect } from '@playwright/test'
import { createRequire } from 'node:module'

// A11Y-8F: runs axe-core (open source, local, no service) inside the page.
//
// Blocking impacts are critical and serious. Moderate and minor findings are
// returned and attached to the test report, but do not fail the run.
//
// There is no global rule disabling and no exclusion list. A scan may pass a
// narrow `exclude` selector only with a documented, owned reason next to it
// (none is needed today).

const require = createRequire(import.meta.url)
const axeSourcePath = require.resolve('axe-core/axe.min.js')

export const blockingImpacts = ['critical', 'serious']

export async function runAxe(page, { include = null, exclude = [] } = {}) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) {
    await page.addScriptTag({ path: axeSourcePath })
  }
  return page.evaluate(async ({ include: scanInclude, exclude: scanExclude }) => {
    const context = scanInclude ? { include: [scanInclude], exclude: scanExclude.map((selector) => [selector]) } : { exclude: scanExclude.map((selector) => [selector]) }
    const result = await window.axe.run(context, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    })
    return result.violations.map((violation) => ({
      help: violation.help,
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.slice(0, 5).map((node) => ({ summary: (node.failureSummary || '').split('\n').slice(0, 3).join(' '), target: node.target.join(' ') })),
    }))
  }, { exclude, include })
}

// A11Y-8Z3: runs named axe rules only (for rules the tag sets above do not
// include, such as the experimental label-content-name-mismatch). Returns one
// "rule: target" line per finding.
export async function runAxeRules(page, rules, { exclude = [] } = {}) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) {
    await page.addScriptTag({ path: axeSourcePath })
  }
  return page.evaluate(async ({ ruleIds, scanExclude }) => {
    const result = await window.axe.run({ exclude: scanExclude.map((selector) => [selector]) }, { resultTypes: ['violations'], runOnly: { type: 'rule', values: ruleIds } })
    return result.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`))
  }, { ruleIds: rules, scanExclude: exclude })
}

export function formatViolations(violations) {
  return violations
    .map((violation) => `[${violation.impact}] ${violation.id}: ${violation.help}\n${violation.nodes.map((node) => `    ${node.target} — ${node.summary}`).join('\n')}`)
    .join('\n')
}

// Scans, attaches every finding to the report, and fails on critical/serious.
// `block` widens the gate for views that are known to be clean at that level
// (A11Y-8I: the main sections also block on moderate findings).
export async function expectNoBlockingAxeViolations(page, testInfo, label, options = {}) {
  const { block = blockingImpacts, ...scanOptions } = options
  const violations = await runAxe(page, scanOptions)
  const blocking = violations.filter((violation) => block.includes(violation.impact))
  const advisory = violations.filter((violation) => !block.includes(violation.impact))
  await testInfo.attach(`axe-${label}.json`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' })
  if (advisory.length) {
    testInfo.annotations.push({ description: advisory.map((violation) => `${violation.impact} ${violation.id} (${violation.nodes.length})`).join(', '), type: `axe advisory: ${label}` })
  }
  expect(blocking, `${label}: axe ${block.join('/')} violations\n${formatViolations(blocking)}`).toEqual([])
  return violations
}
