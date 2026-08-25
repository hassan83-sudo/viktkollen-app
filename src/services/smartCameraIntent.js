/**
 * Compatibility shim. Smart Camera hub lives in src/features/smart-camera.
 * Body scan and food scanning still use their existing camera entry points.
 */
export {
  futureSmartCameraModes,
  getExistingCameraEntryPoints,
  smartCameraPrivacy as futureSmartCameraPrivacy,
} from '../features/smart-camera/smartCameraModes.js'
