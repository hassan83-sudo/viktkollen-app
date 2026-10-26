import {
  TEST_FEEDBACK_CATEGORIES,
  TEST_FEEDBACK_FEATURES,
  TEST_FEEDBACK_RATINGS,
  TEST_FEEDBACK_STATUSES,
  labelFor,
} from './testFeedbackOptions.js'

// Semikolon och citattecken så att filen öppnas rätt i svenska Excel.
function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export function buildTestFeedbackCsv(reports) {
  const header = ['id', 'tid', 'användare', 'funktioner', 'kategori', 'bedömning', 'status', 'kommentar', 'adminanteckning', 'version']
  const rows = reports.map((report) => [
    report.id,
    report.created_at,
    report.user_email || report.user_id,
    (report.features || []).map((id) => labelFor(TEST_FEEDBACK_FEATURES, id)).join('; '),
    labelFor(TEST_FEEDBACK_CATEGORIES, report.category),
    report.rating ? labelFor(TEST_FEEDBACK_RATINGS, report.rating) : '',
    labelFor(TEST_FEEDBACK_STATUSES, report.status),
    report.comment,
    report.admin_note,
    report.app_version,
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')
}
