import { expect, test } from '@playwright/test'
import { moreHubFolders } from '../../src/services/more/moreFolders.js'
import { goToSection, horizontalOverflow, openApp } from './support/app.js'
import { runAxe, runAxeRules } from './support/axe.js'
import { tabStops } from './support/hiddenFocus.js'
import { tabThroughView } from './support/obscuredFocus.js'

// A11Y-8N (8M C-N1 / C3): every Mer folder is part of the permanent gate.
//
// For each folder, opened with the keyboard in the offline test app:
// - axe: no critical, serious or moderate violations (moderate in all
//   folders since A11Y-8Z3, 8Y C4), and no Label in Name finding (8Y C13);
// - focus not obscured at 320 px with extra large text (A11Y-8Z3, 8Y C5);
// - focus: Tab through the folder; no Tab stop may be visually hidden,
//   transparent, off-screen or without a focus indicator (C-N2, see
//   support/hiddenFocus.js);
// - reflow (A11Y-8P, 8M A-N1; A11Y-8U, 8T C-8T-N1): the folder does not
//   scroll sideways at 390 px, at the WCAG 1.4.10 width of 320 px, and at
//   320 px with extra large text and large controls. 200 % and more Mat
//   panels are covered in mat-reflow.spec.js.
//
// Coverage is checked against the app's own folder list, so a folder that is
// added to Mer, or dropped from `coveredFolders`, fails the suite.

const coveredFolders = [
  'mal-framsteg',
  'mat',
  'aktivitet',
  'ai-coach',
  'ma-bra',
  'senior-65-plus',
  'ekonomi',
  'inkasso',
  'kronofogden',
  'sign-language',
  'animal-world',
  'pregnancy-first-year',
  'accessibility',
  'sakerhet-backup',
  'import-export',
  'arkiv-historik',
  'installningar',
]

// Known findings from the A11Y-8M audit (docs/accessibility/
// A11Y_8M_POST_FIX_AUDIT.md) that belong to later sprints. Nothing else may
// be listed here. Each entry is one exact rule in one exact folder. An entry
// that no longer reproduces fails the suite, so it is removed when fixed.
// A11Y-8O fixed and removed: ai-coach aria-prohibited-attr (8M A-N3) and
// ai-coach color-contrast (8M A-N2).
const knownAxeFindings = []

// A11Y-8Z3 (8Y C4): every folder is clean at the moderate level too, and
// must stay so. (8V gated 9 of the 17; the 8Y audit found all 17 clean.)
const blockingImpacts = ['critical', 'serious', 'moderate']

const knownFocusFindings = [
  {
    folder: 'sakerhet-backup',
    stop: 'input[type=file] "Importera molnbackup från JSON-fil"',
    problem: 'self-visually-hidden',
    finding: '8M A-N4: sr-only file input is a Tab stop (CloudBackupPanel.jsx). BLOCKED — CURSOR-OWNED',
    sprint: 'Cursor handoff (Molnbackup)',
  },
]

// The same Cursor-owned control (A-N4): the sr-only file input is a Tab stop,
// so at 320 px its 1 px box sits under the visible import button.
const knownObscuredFindings = [
  {
    folder: 'sakerhet-backup',
    stop: 'Importera molnbackup från JSON-fil',
    finding: '8M A-N4: sr-only file input is a Tab stop (CloudBackupPanel.jsx). BLOCKED — CURSOR-OWNED',
    sprint: 'Cursor handoff (Molnbackup)',
  },
]

function folderButton(page, folder) {
  const title = folder.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.locator('#app-section-more').getByRole('button', { name: new RegExp(`^${title}`) }).first()
}

async function openFolder(page, folder, preferences = null) {
  await openApp(page, { preferences, reducedMotion: 'reduce' })
  await goToSection(page, 'Mer', 'more')
  const button = folderButton(page, folder)
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#app-section-more').getByRole('heading', { level: 1, name: folder.title }).first()).toBeVisible()
  // Lazy folder content: wait until the loading fallbacks are gone.
  await expect(page.locator('#app-section-more .lazy-section-fallback')).toHaveCount(0, { timeout: 15000 })
}

test('every Mer folder is covered by the accessibility gate', () => {
  expect([...coveredFolders].sort()).toEqual(moreHubFolders.map((folder) => folder.id).sort())
  expect(coveredFolders).toHaveLength(17)
  for (const entry of [...knownAxeFindings, ...knownFocusFindings, ...knownObscuredFindings]) {
    expect(coveredFolders, `baseline entry for unknown folder ${entry.folder}`).toContain(entry.folder)
    expect(entry.finding, 'baseline entry must name its 8M finding').toMatch(/^8M [A-C]-N\d/)
    expect(entry.sprint, 'baseline entry must name its planned sprint').toBeTruthy()
  }
})

for (const id of coveredFolders) {
  const folder = moreHubFolders.find((candidate) => candidate.id === id)

  test.describe(`Mer: ${folder?.title || id}`, () => {
    test('axe: no critical or serious (moderate where gated) violations beyond the documented 8M baseline', async ({ page }, testInfo) => {
      await openFolder(page, folder)
      const violations = await runAxe(page)
      await testInfo.attach(`axe-more-${id}.json`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' })
      const blocking = violations.filter((violation) => blockingImpacts.includes(violation.impact))
      const known = knownAxeFindings.filter((entry) => entry.folder === id)
      const unexpected = blocking.filter((violation) => !known.some((entry) => entry.rule === violation.id))
      expect(unexpected.map((violation) => `[${violation.impact}] ${violation.id}: ${violation.nodes.map((node) => node.target).join(' | ')}`)).toEqual([])
      for (const entry of known) expect(blocking.map((violation) => violation.id), `stale baseline: ${entry.rule} (${entry.finding}) no longer reproduces; remove it`).toContain(entry.rule)
      // A11Y-8Z3 (8Y C13): WCAG 2.5.3 Label in Name. axe's rule is tagged
      // experimental, so the tag-based scan above skips it; it runs by id.
      expect(await runAxeRules(page, ['label-content-name-mismatch']), 'label-content-name-mismatch').toEqual([])
    })

    test('reflow: no horizontal scroll at 390 px, 320 px and 320 px with extra large text', async ({ page }) => {
      await openFolder(page, folder)
      expect(await horizontalOverflow(page), '390 px: page scrolls horizontally (px)').toBeLessThanOrEqual(1)
      await page.setViewportSize({ height: 640, width: 320 })
      await expect.poll(() => horizontalOverflow(page), { message: '320 px: page scrolls horizontally (px)' }).toBeLessThanOrEqual(1)
      await openFolder(page, folder, { largeControls: true, textSize: 'extra-large' })
      expect(await horizontalOverflow(page), '320 px, extra large text: page scrolls horizontally (px)').toBeLessThanOrEqual(1)
    })

    // A11Y-8Z3 (8Y C5): focus is not obscured (2.4.11) at 320 px with extra
    // large text and large controls: every Tab stop is inside the viewport,
    // above the bottom navigation and not covered by another element.
    test('focus not obscured at 320 px with extra large text', async ({ page }) => {
      await page.setViewportSize({ height: 640, width: 320 })
      await openFolder(page, folder, { largeControls: true, textSize: 'extra-large' })
      const { failures } = await tabThroughView(page)
      const known = knownObscuredFindings.filter((entry) => entry.folder === id)
      const isKnown = (failure) => known.some((entry) => failure.startsWith(`${entry.stop}:`))
      expect(failures.filter((failure) => !isKnown(failure))).toEqual([])
      for (const entry of known) expect(failures.some(isKnown), `stale baseline: ${entry.stop} (${entry.finding}) no longer reproduces; remove it`).toBe(true)
    })

    test('focus: every Tab stop is visible and has a focus indicator', async ({ page }) => {
      await openFolder(page, folder)
      const stops = await tabStops(page, 260)
      expect(stops.length, 'the folder has keyboard stops').toBeGreaterThan(0)
      const known = knownFocusFindings.filter((entry) => entry.folder === id)
      const isKnown = (stop, problem) => known.some((entry) => stop.name.startsWith(entry.stop) && problem === entry.problem)
      const unexpected = stops.flatMap((stop) => stop.problems.filter((problem) => !isKnown(stop, problem)).map((problem) => `${stop.name}: ${problem}`))
      expect(unexpected).toEqual([])
      for (const entry of known) {
        expect(stops.some((stop) => stop.name.startsWith(entry.stop) && stop.problems.includes(entry.problem)), `stale baseline: ${entry.stop} (${entry.finding}) no longer reproduces; remove it`).toBe(true)
      }
    })
  })
}
