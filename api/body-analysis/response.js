/**
 * Sends a JSON response from the body analysis API route.
 *
 * @param {import('http').ServerResponse & { status: Function }} response
 * @param {number} status
 * @param {Record<string, unknown>} payload
 * @returns {unknown}
 */
export function sendResponse(response, status, payload) {
  return response.status(status).json(payload)
}
