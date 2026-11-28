import { useFeatureAccess } from '../../services/featureAccess/useFeatureAccess.js'
import TrialOffer from './TrialOffer.jsx'
import { loadSubscriptionAccess } from '../../services/featureAccess/featureAccessClient.js'

export default function SubscriptionGate({ children, feature = 'subscriptionFeatures', onBack }) {
  const access = useFeatureAccess(feature, { load: loadSubscriptionAccess })
  if (access.state === 'allowed') return children
  return <section>
    {onBack && <button type="button" className="secondary-button" onClick={onBack}>← Tillbaka</button>}
    <p role="status">{access.state === 'checking' ? 'Kontrollerar ditt abonnemang…' : 'Den här funktionen ingår i provperioden och abonnemanget för 12 kr/månad. Din sparade information finns kvar.'}</p>
    {access.state === 'locked' && <TrialOffer onStarted={access.ensure} />}
  </section>
}
