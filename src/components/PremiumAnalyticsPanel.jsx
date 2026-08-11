import { useEffect, useState } from 'react'
import {
  premiumAnalyticsChangedEvent,
  premiumAnalyticsScenarios,
  readPremiumAnalyticsSummary,
} from '../services/premiumAnalytics.js'
import { defaultPremiumPricing } from '../services/premiumPricing.js'

const counterLabels = [
  ['aiCoachMessages', 'AI Coach'],
  ['bodyScans', 'Body Scan'],
  ['nutritionAnalyses', 'Nutrition AI'],
  ['voiceSessions', 'Voice sessions'],
  ['aiVoiceReplies', 'AI-röstsvar'],
]

const statusLabels = {
  critical: 'Kritisk',
  green: 'Grön',
  red: 'Röd',
  yellow: 'Gul',
}

function formatSek(value) {
  if (value === Infinity) return 'Ej möjligt'

  return `${Number(value || 0).toLocaleString('sv-SE', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} kr`
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('sv-SE')
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)} %`
}

function PremiumAnalyticsPanel({ userId }) {
  const [scenarioKey, setScenarioKey] = useState('test')
  const [simulator, setSimulator] = useState({
    activeUsers: defaultPremiumPricing.simulatorDefaults.activeUsers,
    averageUsageMultiplier: defaultPremiumPricing.simulatorDefaults.averageUsageMultiplier,
    premiumConversionPercent: defaultPremiumPricing.simulatorDefaults.premiumConversionRate * 100,
    premiumPriceSek: defaultPremiumPricing.subscription.premiumPriceSek,
  })
  const [, setRefreshKey] = useState(0)
  const scenario = {
    activeUsers: simulator.activeUsers,
    averageUsageMultiplier: simulator.averageUsageMultiplier,
    premiumConversionRate: simulator.premiumConversionPercent / 100,
    premiumPriceSek: simulator.premiumPriceSek,
  }
  const summary = readPremiumAnalyticsSummary(userId, {
    pricing: defaultPremiumPricing,
    scenario,
  })

  useEffect(() => {
    function handleAnalyticsChanged() {
      setRefreshKey((current) => current + 1)
    }

    window.addEventListener(premiumAnalyticsChangedEvent, handleAnalyticsChanged)
    return () => window.removeEventListener(premiumAnalyticsChangedEvent, handleAnalyticsChanged)
  }, [])

  function applyScenario(key) {
    const selectedScenario = premiumAnalyticsScenarios[key]
    if (!selectedScenario) return

    setScenarioKey(key)
    setSimulator((current) => ({
      ...current,
      activeUsers: selectedScenario.activeUsers,
      premiumConversionPercent: selectedScenario.premiumConversionRate * 100,
    }))
  }

  function updateSimulatorValue(key, value) {
    setScenarioKey('custom')
    setSimulator((current) => ({
      ...current,
      [key]: Number(value),
    }))
  }

  const topUsage = summary.rankings.byUsage[0]
  const topCost = summary.rankings.byCost[0]
  const bestValue = summary.rankings.bestValue
  const estimated = summary.actualVsEstimated

  return (
    <details className={`panel premium-analytics-panel is-${summary.riskStatus}`}>
      <summary>Premium Analytics</summary>

      <div className="premium-analytics-heading">
        <div>
          <p className="eyebrow">Intern admin</p>
          <h2>Premium ekonomi</h2>
        </div>
        <span>{statusLabels[summary.riskStatus]}</span>
      </div>

      <p className="progress-photo-safety">
        Uppskattat beslutsunderlag. Endast anonymiserad användaridentifierare,
        räknare och kostnadsantaganden sparas, aldrig chatttext, bilder,
        röstinspelningar eller hälsodata. Användare: {userId || 'local-user'}.
      </p>

      <div className="premium-analytics-grid">
        <div>
          <span>Premiumpris</span>
          <strong>{formatSek(summary.monthlyPriceSek)}</strong>
        </div>
        <div>
          <span>Netto efter betalning</span>
          <strong>{formatSek(summary.netRevenueSek)}</strong>
        </div>
        <div>
          <span>Uppskattad AI-kostnad</span>
          <strong>{formatSek(summary.aiCostSek)}</strong>
        </div>
        <div>
          <span>Marginal per användare</span>
          <strong>{formatSek(summary.grossMarginSek)}</strong>
        </div>
      </div>

      <div className="premium-analytics-counters">
        {counterLabels.map(([key, label]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{formatNumber(summary.counters[key])}</strong>
          </div>
        ))}
      </div>

      <section className="premium-analytics-section" aria-labelledby="premium-cost-heading">
        <div className="premium-analytics-section-title">
          <div>
            <p className="eyebrow">API-kostnad per funktion</p>
            <h3 id="premium-cost-heading">Kostnad och användning</h3>
          </div>
        </div>

        <div className="premium-analytics-table">
          {[
            summary.featureCosts.aiCoach,
            summary.featureCosts.bodyScan,
            summary.featureCosts.nutritionPhoto,
          ].map((feature) => (
            <div className="premium-analytics-row" key={feature.label}>
              <strong>{feature.label}</strong>
            <span>{formatNumber(feature.requests)} anrop</span>
              <span>{formatSek(feature.costPerRequestSek)} / anrop</span>
              <span>{formatSek(feature.totalCostSek)}</span>
            </div>
          ))}
          <div className="premium-analytics-row">
            <strong>Voice Conversation</strong>
            <span>{formatNumber(summary.featureCosts.voice.requests)} sessioner</span>
            <span>Browser STT/TTS: {formatSek(0)}</span>
            <span>AI-text räknas under AI Coach</span>
          </div>
          {summary.featureCosts.localFeatures.map((feature) => (
            <div className="premium-analytics-row" key={feature.label}>
              <strong>{feature.label}</strong>
              <span>{feature.note}</span>
              <span>{formatSek(feature.totalCostSek)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="premium-analytics-section" aria-labelledby="premium-ranking-heading">
        <div className="premium-analytics-section-title">
          <div>
            <p className="eyebrow">Ranking</p>
            <h3 id="premium-ranking-heading">Användning vs kostnad</h3>
          </div>
        </div>

        <div className="premium-analytics-topline">
          <div>
            <span>Mest använd</span>
            <strong>{topUsage?.label || 'Saknas'}</strong>
          </div>
          <div>
            <span>Dyrast</span>
            <strong>{topCost?.label || 'Saknas'}</strong>
          </div>
          <div>
            <span>Bäst värde</span>
            <strong>{bestValue?.label || 'Saknas'}</strong>
          </div>
        </div>

        <div className="premium-analytics-bars">
          {summary.rankings.rows.map((row) => (
            <div className="premium-analytics-bar-row" key={row.key}>
              <span>{row.label}</span>
              <div aria-label={`${row.label} användningsandel ${formatPercent(row.usageShare)}`}>
                <i style={{ width: formatPercent(row.usageShare) }} />
              </div>
              <strong>{formatPercent(row.usageShare)} användning</strong>
              <strong>{formatPercent(row.costShare)} kostnad</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="premium-analytics-section" aria-labelledby="premium-simulator-heading">
        <div className="premium-analytics-section-title">
          <div>
            <p className="eyebrow">Ekonomisimulator</p>
            <h3 id="premium-simulator-heading">Scenario och marginal</h3>
          </div>
        </div>

          <div className="premium-analytics-scenarios" aria-label="Välj scenario">
          {Object.entries(premiumAnalyticsScenarios).map(([key, value]) => (
            <button
              className={scenarioKey === key ? 'active' : ''}
              key={key}
              onClick={() => applyScenario(key)}
              type="button"
            >
              {value.label}
            </button>
          ))}
        </div>

        <div className="premium-analytics-inputs">
          <label>
            Aktiva användare
            <input
              min="0"
              onChange={(event) => updateSimulatorValue('activeUsers', event.target.value)}
              type="number"
              value={simulator.activeUsers}
            />
          </label>
          <label>
            Premium %
            <input
              min="0"
              onChange={(event) => updateSimulatorValue('premiumConversionPercent', event.target.value)}
              step="1"
              type="number"
              value={simulator.premiumConversionPercent}
            />
          </label>
          <label>
            Premiumpris
            <input
              min="0"
              onChange={(event) => updateSimulatorValue('premiumPriceSek', event.target.value)}
              step="1"
              type="number"
              value={simulator.premiumPriceSek}
            />
          </label>
          <label>
            AI-användning x
            <input
              min="0"
              onChange={(event) => updateSimulatorValue('averageUsageMultiplier', event.target.value)}
              step="0.1"
              type="number"
              value={simulator.averageUsageMultiplier}
            />
          </label>
        </div>

        <div className="premium-analytics-grid">
          <div>
            <span>Premiumanvändare</span>
            <strong>{formatNumber(summary.scenario.premiumUsers)}</strong>
          </div>
          <div>
            <span>Premiumintäkt</span>
            <strong>{formatSek(summary.scenario.revenueSek)}</strong>
          </div>
          <div>
            <span>Betalningsavgifter</span>
            <strong>{formatSek(summary.scenario.paymentFeesSek)}</strong>
          </div>
          <div>
            <span>Bruttovinst</span>
            <strong>{formatSek(summary.scenario.grossProfitSek)}</strong>
          </div>
          <div>
            <span>Bruttomarginal</span>
            <strong>{formatPercent(summary.scenario.grossMarginRatio)}</strong>
          </div>
          <div>
            <span>ARPU</span>
            <strong>{formatSek(summary.scenario.arpuSek)}</strong>
          </div>
        </div>

        <div className="premium-analytics-chart" aria-label="Intäkter och kostnader">
          {[
            ['Intäkter', summary.scenario.revenueSek],
            ['Betalning', summary.scenario.paymentFeesSek],
            ['AI', summary.scenario.aiCostsSek],
            ['Infrastruktur', summary.scenario.infrastructureSek],
            ['Vinst', Math.max(0, summary.scenario.grossProfitSek)],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <i style={{
                height: `${Math.max(6, Math.min(100, (Number(value) / Math.max(1, summary.scenario.revenueSek)) * 100))}%`,
              }}
              />
              <strong>{formatSek(value)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="premium-analytics-section" aria-labelledby="premium-breakeven-heading">
        <div className="premium-analytics-section-title">
          <div>
            <p className="eyebrow">Break-even</p>
            <h3 id="premium-breakeven-heading">Pris och fasta kostnader</h3>
          </div>
        </div>

        <div className="premium-analytics-grid">
          <div>
            <span>Premiumanvändare för break-even</span>
            <strong>{summary.breakEven.requiredPremiumUsers === Infinity ? 'Ej möjligt' : formatNumber(summary.breakEven.requiredPremiumUsers)}</strong>
          </div>
          <div>
            <span>Break-even-pris</span>
            <strong>{formatSek(summary.breakEven.breakEvenPriceSek)}</strong>
          </div>
          <div>
            <span>Pris för 40 % marginal</span>
            <strong>{formatSek(summary.breakEven.priceFor40MarginSek)}</strong>
          </div>
          <div>
            <span>Fasta kostnader / månad</span>
            <strong>{formatSek(summary.scenario.infrastructureSek)}</strong>
          </div>
          <div>
            <span>Fast kostnad / aktiv</span>
            <strong>{formatSek(summary.scenario.infrastructurePerActiveUserSek)}</strong>
          </div>
          <div>
            <span>Fast kostnad / Premium</span>
            <strong>{formatSek(summary.scenario.infrastructurePerPremiumUserSek)}</strong>
          </div>
        </div>

        <div className="premium-analytics-table">
          {summary.sensitivity.map((row) => (
            <div className="premium-analytics-row" key={row.premiumPriceSek}>
              <strong>{formatSek(row.premiumPriceSek)}</strong>
              <span>Netto {formatSek(row.netRevenuePerPremiumUserSek)}</span>
              <span>Kostnad {formatSek(row.costPerPremiumUserSek)}</span>
              <span>Vinst {formatSek(row.profitPerPremiumUserSek)}</span>
              <span>Marginal {formatPercent(row.marginRatio)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="premium-analytics-section" aria-labelledby="premium-calibration-heading">
        <div className="premium-analytics-section-title">
          <div>
            <p className="eyebrow">Kalibrering</p>
            <h3 id="premium-calibration-heading">Verklig vs uppskattad kostnad</h3>
          </div>
        </div>
        <div className="premium-analytics-grid">
          <div>
          <span>Beräknad OpenAI-kostnad</span>
            <strong>{formatSek(estimated.estimatedOpenAiSek)}</strong>
          </div>
          <div>
            <span>Verklig OpenAI-kostnad</span>
            <strong>{estimated.actualOpenAiSek === null ? 'Inte angiven' : formatSek(estimated.actualOpenAiSek)}</strong>
          </div>
          <div>
            <span>Skillnad</span>
            <strong>{estimated.differenceSek === null ? 'Inte angiven' : formatSek(estimated.differenceSek)}</strong>
          </div>
        </div>
      </section>
    </details>
  )
}

export default PremiumAnalyticsPanel
