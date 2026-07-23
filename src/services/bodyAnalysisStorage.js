import {
  getBodyAnalysisHistoryPayload,
  saveBodyAnalysisHistoryPayload,
} from './userDataRepository.js'

export const localBodyAnalysisStorage = {
  /**
   * Reads the stored body analysis payload from localStorage.
   *
   * @returns {unknown}
   */
  read() {
    return getBodyAnalysisHistoryPayload(null)
  },

  /**
   * Writes the body analysis payload to localStorage.
   *
   * @param {object} payload
   * @returns {void}
   */
  write(payload) {
    saveBodyAnalysisHistoryPayload(payload)
  },
}

export const databaseBodyAnalysisStorage = {
  /**
   * Placeholder for future database-backed body analysis reads.
   *
   * @returns {never}
   */
  read() {
    throw new Error('Database body analysis storage is not implemented')
  },

  /**
   * Placeholder for future database-backed body analysis writes.
   *
   * @returns {never}
   */
  write() {
    throw new Error('Database body analysis storage is not implemented')
  },
}

/**
 * Gets the active body analysis storage adapter.
 *
 * @returns {{read: Function, write: Function}}
 */
export function getBodyAnalysisStorage() {
  return localBodyAnalysisStorage
}
