import process from 'node:process'
import { runCoachRoutePreflightCli } from './coachRoutePreflight.js'

process.exitCode = await runCoachRoutePreflightCli()
