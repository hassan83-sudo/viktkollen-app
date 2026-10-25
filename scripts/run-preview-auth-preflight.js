import { runPreviewAuthDeploymentPreflight, runPreviewAuthPreflight } from './previewAuthPreflight.js'

const deploymentFlag = process.argv.indexOf('--deployment')
if (deploymentFlag !== -1) {
  const deploymentUrl = process.argv[deploymentFlag + 1] || ''
  process.exitCode = await runPreviewAuthDeploymentPreflight({ deploymentUrl })
} else {
  process.exitCode = runPreviewAuthPreflight()
}
