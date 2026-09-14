const LANGUAGES = [['sv','Svenska'],['en','English'],['da','Dansk'],['de','Deutsch'],['es','Español'],['fr','Français']]

async function translateText(text, targetLanguage) {
  if (!globalThis.Translator?.create || !globalThis.LanguageDetector?.create) throw new Error('unsupported')
  const detector = await globalThis.LanguageDetector.create()
  const detected = await detector.detect(text)
  const sourceLanguage = detected?.[0]?.detectedLanguage
  if (!sourceLanguage) throw new Error('unsupported')
  if (sourceLanguage === targetLanguage) return text
  const translator = await globalThis.Translator.create({ sourceLanguage, targetLanguage })
  return translator.translate(text)
}

function enhanceMessage(item) {
  if (item.dataset.translateReady === '1') return
  const original = item.querySelector(':scope > p')
  if (!original?.textContent?.trim()) return
  item.dataset.translateReady = '1'

  const controls = document.createElement('div')
  controls.className = 'social-message-translate'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'social-message-translate-button'
  button.textContent = 'Översätt'
  controls.appendChild(button)

  button.addEventListener('click', () => {
    const existing = controls.querySelector('.social-message-language-menu')
    if (existing) { existing.remove(); return }
    const menu = document.createElement('div')
    menu.className = 'social-message-language-menu'
    LANGUAGES.forEach(([code, label]) => {
      const choice = document.createElement('button')
      choice.type = 'button'
      choice.textContent = label
      choice.addEventListener('click', async () => {
        menu.remove(); button.disabled = true; button.textContent = 'Översätter…'
        controls.querySelector('.social-message-translation')?.remove()
        controls.querySelector('.social-message-translation-error')?.remove()
        try {
          const translated = await translateText(original.textContent.trim(), code)
          const result = document.createElement('p')
          result.className = 'social-message-translation'
          result.textContent = translated
          controls.appendChild(result)
          button.textContent = 'Översätt igen'
        } catch {
          const error = document.createElement('small')
          error.className = 'social-message-translation-error'
          error.textContent = 'Översättning stöds inte av den här webbläsaren ännu.'
          controls.appendChild(error)
          button.textContent = 'Översätt'
        } finally { button.disabled = false }
      })
      menu.appendChild(choice)
    })
    controls.appendChild(menu)
  })
  original.insertAdjacentElement('afterend', controls)
}

function scan() { document.querySelectorAll('.social-message-list > li').forEach(enhanceMessage) }
if (typeof document !== 'undefined') {
  const observer = new MutationObserver(scan)
  const start = () => { scan(); observer.observe(document.body, { childList: true, subtree: true }) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
}
