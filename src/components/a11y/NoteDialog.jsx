import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FormDialog from './FormDialog.jsx'

// A11Y-8X2 (8M B13): replaces the browser prompt for the note of a
// progress photo. A labelled textarea with the current note; Save stores the
// text as it is (an empty note clears it, as an empty prompt answer did),
// Cancel and Escape change nothing.

function NoteDialog({ initialNote = '', onCancel, onSave }) {
  const { t } = useTranslation('common')
  const [note, setNote] = useState(initialNote)
  const fieldRef = useRef(null)

  return (
    <FormDialog
      initialFocusRef={fieldRef}
      submitLabel={t('actions.save')}
      title={t('noteDialog.title')}
      onCancel={onCancel}
      onSubmit={() => onSave(note)}
    >
      <label className="field">
        <span>{t('noteDialog.label')}</span>
        <textarea ref={fieldRef} rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
    </FormDialog>
  )
}

export default NoteDialog
