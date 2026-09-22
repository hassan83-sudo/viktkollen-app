import process from 'node:process'
import { runBillingStagingPreflightCli } from '../src/services/billing/stagingVerification.js'

const code = await runBillingStagingPreflightCli()
process.exitCode = code
