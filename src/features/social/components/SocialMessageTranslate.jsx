import { useState } from 'react'

const TARGETS = [
  ['sv', 'Svenska'],
  ['en', 'English'],
  ['da', 'Dansk'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['fr', 'Français'],
]

async function detectLanguage(text) {
  if (!globalThis.LanguageDetector?.create) return null
  const detector = await globalThis.LanguageDetector.create()
  const results = await detector.detect(text)
  return results?.[0]?.detectedLanguage || null
}

export default function SocialMessageTranslate({ text = '' }) {
  const [open, setOpen] = useState(false)
  const [translated, setTranslated] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function translate(targetLanguage) {
    setBusy(true)
    setError('')
    try {
      if (!globalThis.Translator?.create) throw new Error('unsupported')
      const sourceLanguage = await detectLanguage(text)
      if (!sourceLanguage) throw new Error('unsupported')
      if (sourceLanguage === targetLanguage) {
        setTranslated(text)
        setOpen(false)
        return
      }
      const translator = await globalThis.Translator.create({ sourceLanguage, targetLanguage })
      setTranslated(await translator.translate(text))
      setOpen(false)
    } catch {
      setError('Översättning stöds inte av den här webbläsaren ännu.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="social-message-translate">
      <button className="social-message-translate-button" type="button" onClick={() => { setOpen((value) => !value); setError('') }}>
        {translated ? 'Översätt igen' : 'Översätt'}
      </button>
      {translated ? <button className="social-message-translate-button" type="button" onClick={() => setTranslated('')}>Visa original</button> : null}
      {open ? <div className="social-message-language-menu" aria-label="Välj språk">{TARGETS.map(([code, label]) => <button type="button" disabled={busy} key={code} onClick={() => translate(code)}>{label}</button>)}</div> : null}
      {translated ? <p className="social-message-translation">{translated}</p> : null}
      {error ? <small className="social-message-translation-error">{error}</small> : null}
    </div>
  )
}
