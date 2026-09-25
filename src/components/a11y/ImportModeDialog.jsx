import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FormDialog from './FormDialog.jsx'

// A11Y-8X2 (8M B13): replaces the free-text window.prompt ("Skriv "slå
// ihop" eller "ersätt"") for the import mode in Mat and Framsteg. The two
// modes are a radio group; "Slå ihop" is preselected, as the prompt's
// default was. The replace confirmation that follows stays unchanged.

function ImportModeDialog({ fallbackFocusRef, onCancel, onConfirm, summary }) {
  const { t } = useTranslation('common')
  const id = useId()
  const [mode, setMode] = useState('merge')
  const checkedRef = useRef(null)

  return (
    <FormDialog
      description={summary}
      fallbackFocusRef={fallbackFocusRef}
      initialFocusRef={checkedRef}
      submitLabel={t('importModeDialog.confirm')}
      title={t('importModeDialog.title')}
      onCancel={onCancel}
      onSubmit={() => onConfirm(mode)}
    >
      <fieldset className="form-dialog-choices">
        <legend>{t('importModeDialog.legend')}</legend>
        {['merge', 'replace'].map((value) => (
          <label className="form-dialog-choice" key={value}>
            <input
              checked={mode === value}
              name={`${id}-mode`}
              ref={mode === value ? checkedRef : undefined}
              type="radio"
              value={value}
              onChange={() => setMode(value)}
            />
            <span>{t(`importModeDialog.${value}`)}</span>
          </label>
        ))}
      </fieldset>
    </FormDialog>
  )
}

export default ImportModeDialog
