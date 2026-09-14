import { supabase } from '../../services/supabaseClient.js'

const ROOT_ID = 'account-password-settings'

function createPasswordSettings() {
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.className = 'app-information account-password-settings'
  root.innerHTML = `
    <h3>Säkerhet</h3>
    <p>Ändra lösenord för ditt Viktkollen-konto.</p>
    <label>Nytt lösenord
      <span class="account-password-input-row">
        <input data-password="new" type="password" autocomplete="new-password" minlength="6" placeholder="Minst 6 tecken" />
        <button data-toggle="new" class="secondary-button" type="button">Visa</button>
      </span>
    </label>
    <label>Bekräfta nytt lösenord
      <span class="account-password-input-row">
        <input data-password="confirm" type="password" autocomplete="new-password" minlength="6" placeholder="Skriv lösenordet igen" />
        <button data-toggle="confirm" class="secondary-button" type="button">Visa</button>
      </span>
    </label>
    <button data-save class="primary-button" type="button">Spara nytt lösenord</button>
    <p data-status class="account-password-status" role="status" aria-live="polite"></p>
  `

  const newInput = root.querySelector('[data-password="new"]')
  const confirmInput = root.querySelector('[data-password="confirm"]')
  const status = root.querySelector('[data-status]')
  const saveButton = root.querySelector('[data-save]')

  root.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = root.querySelector(`[data-password="${button.dataset.toggle}"]`)
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      button.textContent = show ? 'Dölj' : 'Visa'
    })
  })

  saveButton.addEventListener('click', async () => {
    const password = newInput.value
    const confirmation = confirmInput.value
    status.textContent = ''

    if (password.length < 6) {
      status.textContent = 'Lösenordet måste vara minst 6 tecken.'
      return
    }
    if (password !== confirmation) {
      status.textContent = 'Lösenorden är inte lika.'
      return
    }
    if (!supabase) {
      status.textContent = 'Kontot är inte anslutet just nu.'
      return
    }

    saveButton.disabled = true
    saveButton.textContent = 'Sparar…'
    const { error } = await supabase.auth.updateUser({ password })
    saveButton.disabled = false
    saveButton.textContent = 'Spara nytt lösenord'

    if (error) {
      status.textContent = error.message || 'Kunde inte ändra lösenordet.'
      return
    }

    newInput.value = ''
    confirmInput.value = ''
    status.textContent = 'Lösenordet är ändrat.'
  })

  return root
}

function mountPasswordSettings() {
  const settings = document.querySelector('#installningar.account-settings-panel')
  if (!settings || settings.querySelector(`#${ROOT_ID}`)) return

  const actions = settings.querySelector('.account-settings-actions')
  const passwordSettings = createPasswordSettings()
  if (actions) actions.before(passwordSettings)
  else settings.append(passwordSettings)
}

if (typeof window !== 'undefined') {
  const observer = new MutationObserver(mountPasswordSettings)
  const start = () => {
    mountPasswordSettings()
    observer.observe(document.body, { childList: true, subtree: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
}
