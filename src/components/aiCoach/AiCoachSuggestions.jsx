import { useTranslation } from 'react-i18next'
import QuickActions from '../QuickActions.jsx'

function AiCoachSuggestions({ onStarterPrompt, starterPrompts }) {
  const { t } = useTranslation(['coach'])

  if (!starterPrompts || starterPrompts.length === 0) return null

  return (
    <section className="ai-coach-overlay-suggestions" aria-labelledby="ai-coach-suggestions-title">
      <p className="ai-coach-overlay-suggestions-title" id="ai-coach-suggestions-title">
        {t('coach:overlay.suggestionsTitle')}
      </p>
      <QuickActions onStarterPrompt={onStarterPrompt} starterPrompts={starterPrompts} />
    </section>
  )
}

export default AiCoachSuggestions
