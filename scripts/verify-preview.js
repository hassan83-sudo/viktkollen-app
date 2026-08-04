import process from 'node:process'
import { runPreviewVerifierCli } from './previewVerifier.js'

process.exitCode = await runPreviewVerifierCli()
