import process from 'node:process'
import { runStagingValidationCli } from './stagingEnvironmentValidator.js'

process.exitCode = runStagingValidationCli()
