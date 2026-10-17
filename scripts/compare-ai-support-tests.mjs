import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const [baselinePath, candidatePath, outputPath] = process.argv.slice(2)
if (!baselinePath || !candidatePath || !outputPath) throw new Error('Usage: node scripts/compare-ai-support-tests.mjs baseline.json candidate.json report.md')
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'))
function failures(run) {
  const found = new Map()
  for (const file of run.testResults) {
    const path = file.name.replaceAll('\\', '/').replace(/^.*?\/(?:ai-support-baseline|review-app)\//, '')
    const failed = file.assertionResults.filter((test) => test.status === 'failed')
    for (const test of failed) found.set(`${path} — ${test.fullName}`, path)
    if (file.status === 'failed' && !failed.length) found.set(`${path} — suite load failure`, path)
  }
  return found
}
const before = failures(baseline)
const after = failures(candidate)
const remaining = [...after.keys()].filter((key) => before.has(key)).sort()
const resolved = [...before.keys()].filter((key) => !after.has(key)).sort()
const added = [...after.keys()].filter((key) => !before.has(key)).sort()
const bullet = (items) => items.length ? items.map((name) => `- ${name}`).join('\n') : '- Inga.'
const report = `# Testjämförelse för AI-kundtjänst\n\nBas: isolerad worktree på 8a9597d (före 7dbe726). Samma låsfil/runtime, förutom kandidatens nya testberoende PGlite. Båda körningarna använder mockade tjänster; inga produktionshemligheter.\n\n| Körning | Godkända tester | Misslyckade tester |\n| --- | ---: | ---: |\n| Ursprung | ${baseline.numPassedTests} | ${baseline.numFailedTests} |\n| Arbetsgren | ${candidate.numPassedTests} | ${candidate.numFailedTests} |\n\nJämförelsen identifierar tester via relativ fil och fullständigt testnamn, inte enbart antal. Suite-laddningsfel redovisas separat genom sin fil. En skillnad är en kandidat för regression eller timingfel och behöver bedömas.\n\n## Nya misslyckanden\n\n${bullet(added)}\n\n## Upphörda misslyckanden\n\n${bullet(resolved)}\n\n## Kvar från ursprunget\n\n${bullet(remaining)}\n`
writeFileSync(outputPath, report)
process.stdout.write(JSON.stringify({ baselineFailed: baseline.numFailedTests, candidateFailed: candidate.numFailedTests, newFailures: added, resolved: resolved.length, existing: remaining.length }) + '\n')
