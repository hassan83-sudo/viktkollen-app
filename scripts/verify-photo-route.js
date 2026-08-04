import process from 'node:process'
import { runPhotoRoutePreflightCli } from './photoRoutePreflight.js'

process.exitCode = await runPhotoRoutePreflightCli()
