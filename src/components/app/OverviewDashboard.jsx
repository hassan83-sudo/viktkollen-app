import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AchievementPreviewCard from './AchievementPreviewCard.jsx'
import DailyCoachCard from './DailyCoachCard.jsx'
import DailyMealPlannerCard from './DailyMealPlannerCard.jsx'
import HealthPredictionCard from './HealthPredictionCard.jsx'
import SmartNotificationsCard from './SmartNotificationsCard.jsx'
import WeeklyProgressSection from './WeeklyProgressSection.jsx'
import BodyScanRings from './BodyScanRings.jsx'
import OverviewBodyScanStage from './OverviewBodyScanStage.jsx'
import OverviewCoachStage from './OverviewCoachStage.jsx'
import OverviewFoodScanStage from './OverviewFoodScanStage.jsx'
import {
  createFallbackWeatherContext,
  createOverviewLiveContext,
  formatWeatherValue,
  getWeatherPermissionState,
} from '../../services/overviewLiveContext.js'
import { loadOverviewWeather } from '../../services/overviewWeather.js'
import { createProfilePhotoFromFile, readProfilePhoto, writeProfilePhoto } from '../../services/profilePhotoStorage.js'
import { getFeatureFlags, isFeatureEnabled } from '../../features/featureRegistry.js'
import HomeSocialPreview from '../../features/social/components/HomeSocialPreview.jsx'
import SocialStage from '../../features/social/components/SocialStage.jsx'
import { createSocialApi } from '../../features/social/services/socialApi.js'
import { buildWeightTrend, formatSignedChange } from '../../services/homeBodyToday.js'
import {
  formatHomeStepsLabel,
  formatHomeWeightLabel,
  measuredWeightsForSparkline,
  resolveHomeSteps,
  resolveHomeWeightKg,
} from '../../services/homeTodayStats.js'
import SmartCameraStage from '../../features/smart-camera/components/SmartCameraStage.jsx'
import BodyAvatarTalkBar from './BodyAvatarTalkBar.jsx'
import { formatNumber as formatLocaleNumber } from '../../i18n/format.js'

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function formatNumber(value, options = {}) {
  const number = Number(value)

  if (!Number.isFinite(number)) return 'Inga data'

  return formatLocaleNumber(number, options)
}

function getInitials(profile, email = '') {
  const name = profile?.name?.trim()
  const source = name || email

  if (!source) return 'VK'

  return source
    .split(/\s+|@/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('sv-SE'))
    .join('') || 'VK'
}

function getProgressPercent(value, goal) {
  const current = Number(value)
  const target = Number(goal)

  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null

  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
}

function getProgressBucket(value) {
  if (!Number.isFinite(Number(value))) return 0

  return Math.max(0, Math.min(100, Math.round(Number(value) / 10) * 10))
}

function getSparklinePoints(weights = []) {
  const values = weights
    .map((entry) => Number(entry?.value ?? entry?.weight))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(-7)

  if (values.length < 2) return ''

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  return values
    .map((value, index) => {
      const x = Math.round((index / (values.length - 1)) * 72)
      const y = Math.round(14 - ((value - min) / range) * 10)

      return `${x},${y}`
    })
    .join(' ')
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener?.('change', updatePreference)

    return () => mediaQuery.removeEventListener?.('change', updatePreference)
  }, [])

  return prefersReducedMotion
}

function buildSmartFeedItems(liveContext) {
  const weather = liveContext.weather
  return [
    {
      id: 'live-clock',
      category: 'Nu',
      title: `${liveContext.weekday}, ${liveContext.dateLabel}`,
      body: `Lokal tid ${liveContext.timeLabel}. Dagens feed är redo att kopplas till riktiga livekällor när API:er finns.`,
      sourceLabel: 'Live från enheten',
      kind: 'time',
      personalization: ['timeOfDay', 'ageGroup', 'interests'],
    },
    {
      id: 'weather-fallback',
      category: 'Väder',
      title: weather.hasLiveWeather ? `${weather.condition} i ${weather.city}` : 'Väder väntar på källa',
      body: weather.hasLiveWeather
        ? `${formatWeatherValue(weather.temperatureC, '°C')}, ${formatWeatherValue(weather.windSpeedMs, ' m/s')} och ${formatWeatherValue(weather.precipitationRiskPercent, ' %')} regnrisk.`
        : 'Ingen väder-API är kopplad ännu. När den finns kan feeden visa temperatur, vind, regnrisk och soluppgång utan att låtsasdata visas.',
      sourceLabel: weather.sourceLabel,
      kind: 'weather',
      personalization: ['location', 'activityLevel', 'preferences'],
    },
    {
      id: 'style-coach-ready',
      category: 'Stilcoach',
      title: 'Klädråd kan bli kontextstyrda',
      body: 'Stilcoach-strukturen kan senare väga ihop väder, årstid, aktivitet, garderob och preferenser med rak men respektfull feedback.',
      sourceLabel: 'Förberett',
      kind: 'style',
      personalization: ['weather', 'season', 'ownedClothes', 'preferences'],
    },
    {
      id: 'useful-idea',
      category: 'Visste du att',
      title: 'Små beslut slår ofta stora ryck',
      body: 'Ett kort nästa steg är lättare att upprepa än en perfekt plan. Feed-kort kan senare anpassas efter mål, ålder och tid på dagen.',
      sourceLabel: 'Demoinsikt',
      kind: 'knowledge',
      personalization: ['goals', 'ageGroup', 'timeOfDay'],
    },
    {
      id: 'activity-ready',
      category: 'Aktivitet',
      title: 'När du vill göra något',
      body: 'Feed-modellen stödjer framtida förslag som promenad, recept, quiz, hjärngympa, musik, film eller ett litet projekt utifrån väder och tid.',
      sourceLabel: 'Förberett',
      kind: 'activity',
      personalization: ['interests', 'weather', 'timeOfDay', 'activityLevel'],
    },
    {
      id: 'quote-ready',
      category: 'Citat',
      title: 'Kvalitet före kvantitet',
      body: 'Feed-kort för citat är förberedda, men visar inte påhittade citat som äkta. Varje framtida citat behöver källa eller tydlig sammanfattningsmarkering.',
      sourceLabel: 'Källkrav',
      kind: 'quote',
      personalization: ['interests', 'language', 'ageGroup'],
    },
  ]
}

function SmartFeedCard({ liveContext }) {
  const { t } = useTranslation('home')
  const [activeIndex, setActiveIndex] = useState(0)
  const [favoriteIds, setFavoriteIds] = useState(() => new Set())
  const [isPaused, setIsPaused] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const items = useMemo(() => buildSmartFeedItems(liveContext), [liveContext])
  const activeItem = items[activeIndex % items.length]
  const isFavorite = favoriteIds.has(activeItem.id)
  const autoRotate = !isPaused && !prefersReducedMotion

  useEffect(() => {
    if (!autoRotate) return undefined

    const rotation = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length)
    }, 10_000)

    return () => window.clearInterval(rotation)
  }, [autoRotate, items.length])

  const showPrevious = () => setActiveIndex((current) => (current - 1 + items.length) % items.length)
  const showNext = () => setActiveIndex((current) => (current + 1) % items.length)
  const toggleFavorite = () => {
    setFavoriteIds((current) => {
      const next = new Set(current)
      if (next.has(activeItem.id)) {
        next.delete(activeItem.id)
      } else {
        next.add(activeItem.id)
      }

      return next
    })
  }

  return (
    <section className="smart-feed-card" id="viktkollen-live" aria-label={t('labels.viktkollenLive')}>
      <div className="smart-feed-intro">
        <div className="smart-feed-title">
          <span className="smart-feed-live-dot" aria-hidden="true" />
          <div>
            <p className="eyebrow">{t('labels.viktkollenLive')}</p>
            <h2>{activeItem.title}</h2>
          </div>
        </div>
        <small>{activeItem.sourceLabel}</small>
      </div>
      <div className="smart-feed-reference-controls" aria-label={t('live.controls')}>
        <button type="button" onClick={showPrevious} aria-label={t('live.previous')}>&lt;</button>
        <button
          className="is-playback"
          type="button"
          aria-pressed={isPaused}
          onClick={() => setIsPaused((current) => !current)}
          aria-label={isPaused || prefersReducedMotion ? t('live.play') : t('live.pause')}
        >
          {isPaused || prefersReducedMotion ? '>' : 'II'}
        </button>
        <button type="button" onClick={showNext} aria-label={t('live.next')}>&gt;</button>
      </div>
      <svg className="smart-feed-wave" viewBox="0 0 360 74" role="img" aria-label={`Live-diagram för ${activeItem.category}`}>
        <defs>
          <linearGradient id="smart-feed-wave-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14ff73" />
            <stop offset="21%" stopColor="#22f6ff" />
            <stop offset="42%" stopColor="#178dff" />
            <stop offset="58%" stopColor="#814bff" />
            <stop offset="73%" stopColor="#ff3bb7" />
            <stop offset="86%" stopColor="#ff7a42" />
            <stop offset="100%" stopColor="#ffe242" />
          </linearGradient>
          <linearGradient id="smart-feed-wave-fill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14ff73" stopOpacity="0.18" />
            <stop offset="48%" stopColor="#178dff" stopOpacity="0.2" />
            <stop offset="76%" stopColor="#ff3bb7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffe242" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        <path className="smart-feed-wave-grid" d="M0 50H360M0 32H360" />
        <path className="smart-feed-wave-fill" d="M0 52 C18 53 27 46 43 47 C62 48 78 21 100 20 C126 20 139 48 164 47 C188 46 198 17 222 15 C248 13 258 50 286 49 C311 48 316 27 339 29 C350 30 355 37 360 36 L360 74 L0 74 Z" />
        <path className="smart-feed-wave-line" d="M0 52 C18 53 27 46 43 47 C62 48 78 21 100 20 C126 20 139 48 164 47 C188 46 198 17 222 15 C248 13 258 50 286 49 C311 48 316 27 339 29 C350 30 355 37 360 36" />
        <g className="smart-feed-wave-dots">
          <circle cx="16" cy="51" r="2.4" />
          <circle cx="80" cy="24" r="2.4" />
          <circle cx="150" cy="47" r="2.4" />
          <circle cx="224" cy="15" r="2.4" />
          <circle cx="294" cy="47" r="2.4" />
          <circle cx="344" cy="31" r="2.4" />
        </g>
      </svg>
      <article className="smart-feed-active-card" aria-live="polite">
        <span className={`smart-feed-thumbnail is-${activeItem.kind}`} aria-hidden="true">{activeItem.category.slice(0, 1)}</span>
        <span>
          <small>{activeItem.category}</small>
          <strong>{activeItem.title}</strong>
          <em>{activeItem.body}</em>
        </span>
        <button type="button" onClick={showNext} aria-label={t('live.next')}>›</button>
      </article>
      <div className="smart-feed-footer">
        <span>{activeItem.sourceLabel}</span>
        <div className="smart-feed-dots" aria-hidden="true">
          {items.map((item, index) => (
            <span className={index === activeIndex % items.length ? 'is-active' : ''} key={item.id} />
          ))}
        </div>
        <div className="smart-feed-controls" aria-label={t('live.controls')}>
          <button type="button" onClick={showPrevious} aria-label={t('live.previous')}>‹</button>
          <button
            type="button"
            aria-pressed={isFavorite}
            onClick={toggleFavorite}
            aria-label={isFavorite ? 'Ta bort feed-kort från favoriter' : 'Spara feed-kort som favorit'}
          >
            {isFavorite ? 'Sparad' : 'Spara'}
          </button>
          <button
            type="button"
            aria-pressed={isPaused}
            onClick={() => setIsPaused((current) => !current)}
          >
            {isPaused || prefersReducedMotion ? 'Spela' : 'Pausa'}
          </button>
          <button type="button" onClick={showNext} aria-label={t('live.next')}>›</button>
        </div>
      </div>
    </section>
  )
}

function shortWeekday(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return `${text.slice(0, 1).toLocaleUpperCase('sv-SE')}${text.slice(1, 3)}`
}

function OverviewLiveMeta({ liveContext, onConnectWeather, weatherStatus = '' }) {
  const { t } = useTranslation('home')
  const weather = liveContext.weather
  const hasWeatherDetails = Boolean(weather.hasLiveWeather)
  const city = hasWeatherDetails && weather.city && weather.city !== 'Vald stad' ? weather.city : ''

  return (
    <div className="overview-live-meta" aria-label="Datum, tid och väder">
      <p>
        <span><OverviewIcon name="calendar" /> {shortWeekday(liveContext.weekday)} {liveContext.dateLabel}</span>
        <span><OverviewIcon name="clock" /> {liveContext.timeLabel}</span>
        {city ? <span>{city}</span> : null}
      </p>
      <p>
        {hasWeatherDetails ? (
          <>
            <span>{formatWeatherValue(weather.temperatureC, '°C')}</span>
            <span><OverviewIcon name="wind" /> {formatWeatherValue(weather.windSpeedMs, ' m/s')}</span>
            <span><OverviewIcon name="drop" /> {formatWeatherValue(weather.precipitationRiskPercent, ' %')}</span>
            <button className="overview-weather-connect" type="button" onClick={onConnectWeather}>
              Min plats
            </button>
          </>
        ) : (
          <>
            <span className="overview-weather-empty" aria-label={t('weatherNotConnected', { defaultValue: 'Väder ej anslutet' })}>
              {weatherStatus || t('weatherNotConnected', { defaultValue: 'Väder ej anslutet' })}
            </span>
            <button className="overview-weather-connect" type="button" onClick={onConnectWeather}>
              {t('connectWeather', { defaultValue: 'Koppla väder' })}
            </button>
          </>
        )}
      </p>
      {hasWeatherDetails && (
        <p>
          <span><OverviewIcon name="sunrise" /> {weather.sunriseLabel}</span>
          <span><OverviewIcon name="sunset" /> {weather.sunsetLabel}</span>
          <span className="overview-weather-source">{weather.sourceLabel}</span>
        </p>
      )}
    </div>
  )
}

function OverviewIcon({ name }) {
  const common = {
    'aria-hidden': 'true',
    className: `overview-svg-icon is-${name}`,
    fill: 'none',
    viewBox: '0 0 48 48',
  }

  if (name === 'robot') {
    return (
      <svg {...common}>
        <rect x="10" y="17" width="28" height="22" rx="10" />
        <path d="M24 17V10M18 10h12" />
        <circle cx="19" cy="28" r="2.8" />
        <circle cx="29" cy="28" r="2.8" />
        <path d="M16 39v3M32 39v3M7 27h3M38 27h3" />
      </svg>
    )
  }

  if (name === 'eye') {
    return (
      <svg {...common}>
        <path d="M6 24c6-10 12-14 18-14s12 4 18 14c-6 10-12 14-18 14S12 34 6 24Z" />
        <circle cx="24" cy="24" r="6" />
      </svg>
    )
  }

  if (name === 'bodyScan') {
    return (
      <svg {...common}>
        <circle cx="24" cy="10" r="5" />
        <path d="M24 15v18M15 24l9-5 9 5M18 38l6-5 6 5" />
        <path d="M8 18v-7h7M40 18v-7h-7M8 30v7h7M40 30v7h-7" />
        <path d="M13 24h22" />
      </svg>
    )
  }

  if (name === 'foodCamera') {
    return (
      <svg {...common}>
        <rect x="9" y="14" width="30" height="24" rx="8" />
        <path d="M17 14l3-5h8l3 5" />
        <circle cx="24" cy="26" r="7" />
        <path d="M17 31c4-4 9-5 14-1M33 19h2" />
      </svg>
    )
  }

  if (name === 'scale') {
    return (
      <svg {...common}>
        <rect x="9" y="11" width="30" height="28" rx="9" />
        <path d="M17 22a8 8 0 0 1 14 0M24 17v6" />
        <path d="M17 32h14" />
      </svg>
    )
  }

  if (name === 'flame') {
    return (
      <svg {...common}>
        <path d="M25 42c8-3 12-8 12-15 0-7-5-12-9-17-1 6-5 9-8 12-2-3-2-6-1-10-5 4-8 10-8 16 0 7 5 12 14 14Z" />
        <path d="M24 38c4-2 6-5 6-9 0-3-2-6-5-9-1 4-4 6-6 9 0 4 2 7 5 9Z" />
      </svg>
    )
  }

  if (name === 'heart') {
    return (
      <svg {...common}>
        <path d="M24 39S9 30 9 18c0-5 4-9 9-9 3 0 5 1 6 4 1-3 4-4 6-4 5 0 9 4 9 9 0 12-15 21-15 21Z" />
      </svg>
    )
  }

  if (name === 'shoe') {
    return (
      <svg {...common}>
        <path d="M9 29c7 3 14 4 25 3 4 0 6 2 6 5H17c-5 0-8-3-8-8Z" />
        <path d="M18 29c0-5 2-10 6-15l10 13M24 27l5-5M29 29l4-4" />
      </svg>
    )
  }

  if (name === 'protein') {
    return (
      <svg {...common}>
        <ellipse cx="18" cy="24" rx="8" ry="11" />
        <path d="M18 13c3 0 5 2 5 4" />
        <path d="M29 18c7 2 10 8 8 14-2 5-8 7-14 6" />
        <path d="M31 22c2 1 4 4 3 7" />
      </svg>
    )
  }

  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="15" />
        <path d="M24 14v11l7 4" />
      </svg>
    )
  }

  if (name === 'wind') {
    return (
      <svg {...common}>
        <path d="M8 18h24c5 0 5-7 0-7-2 0-4 1-5 3M10 25h28M8 32h22c5 0 5 7 0 7-2 0-4-1-5-3" />
      </svg>
    )
  }

  if (name === 'drop') {
    return (
      <svg {...common}>
        <path d="M24 7c8 10 13 17 13 24a13 13 0 0 1-26 0c0-7 5-14 13-24Z" />
      </svg>
    )
  }

  if (name === 'sunrise' || name === 'sunset') {
    return (
      <svg {...common}>
        <path d="M8 35h32M13 28a11 11 0 0 1 22 0" />
        <path d="M24 8v9M12 17l5 5M36 17l-5 5" />
        {name === 'sunrise' ? <path d="M20 14l4-4 4 4" /> : <path d="M20 12l4 4 4-4" />}
      </svg>
    )
  }

  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="M10 25l9 9 19-22" />
      </svg>
    )
  }

  if (name === 'bell') {
    return (
      <svg {...common}>
        <path d="M14 35h20l-3-5v-8c0-5-3-9-7-9s-7 4-7 9v8l-3 5Z" />
        <path d="M21 38c1 2 5 2 6 0M24 13V9" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="10" y="12" width="28" height="27" rx="7" />
        <path d="M16 9v7M32 9v7M10 21h28" />
      </svg>
    )
  }

  if (name === 'arrow') {
    return (
      <svg {...common}>
        <path d="M18 12l12 12-12 12M30 24H10" />
      </svg>
    )
  }

  if (name === 'mealPlan') {
    return (
      <svg {...common}>
        <path d="M14 10v28M22 10v28M32 10v28" />
        <path d="M10 20h28M10 31h28" />
      </svg>
    )
  }

  if (name === 'trend') {
    return (
      <svg {...common}>
        <path d="M9 36h30M12 30l8-8 6 5 10-14" />
        <path d="M31 13h5v5" />
      </svg>
    )
  }

  if (name === 'trophy') {
    return (
      <svg {...common}>
        <path d="M17 11h14v9c0 6-3 11-7 11s-7-5-7-11v-9Z" />
        <path d="M17 15h-6c0 7 3 11 8 11M31 15h6c0 7-3 11-8 11M20 39h8M24 31v8" />
      </svg>
    )
  }

  if (name === 'prediction') {
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="14" />
        <path d="M24 14v10l7 5M14 38l5-6M34 38l-5-6" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M12 24h24M24 12v24" />
    </svg>
  )
}

function scrollToTarget(targetId) {
  const target = document.getElementById(targetId)

  if (target) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const scrollContainer = document.querySelector('.app-scroll-container')

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const top = targetRect.top - containerRect.top + scrollContainer.scrollTop

      scrollContainer.scrollTo({
        top: Math.max(0, top),
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    } else {
      target.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    }
  }

  window.history.replaceState(null, '', `#${targetId}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function OverviewPrimaryActions({
  featureFlags,
  onNavigateSection,
  onOpenBodyScan,
  onOpenCoach,
  onOpenFoodScan,
  onOpenSmartCamera,
  onScanFood,
  onStartBodyScan,
}) {
  const { t } = useTranslation(['bodyScan', 'home'])
  const goTo = (sectionId, targetId) => {
    if (onNavigateSection) {
      onNavigateSection(sectionId, targetId)
      return
    }

    scrollToTarget(targetId)
  }

  const smartCameraOn = isFeatureEnabled('smartCamera', featureFlags)
  const coachAction = {
    accent: 'coach',
    actionIcon: 'arrow',
    alt: 'Viktkollens AI Coach-robot med synlig hjärna',
    art: 'robot',
    description: t('home:actionDescriptions.coach'),
    image: '/viktkollen-ai-coach-robot.png',
    imageHeight: 1199,
    imageWidth: 1312,
    icon: 'robot',
    label: t('home:labels.aiCoach'),
    onClick: () => (onOpenCoach ? onOpenCoach() : goTo('coach', 'chat')),
  }
  const eyesAction = {
    accent: 'eyes',
    actionIcon: 'arrow',
    alt: 'Smart kamera och AI-ögon',
    art: 'eyes',
    description: t('home:actionDescriptions.smartCamera'),
    icon: 'eye',
    label: t('home:labels.aiEyes'),
    onClick: () => onOpenSmartCamera?.(),
  }
  const actions = [
    ...(smartCameraOn ? [eyesAction] : [coachAction]),
    {
      accent: 'body',
      actionIcon: 'foodCamera',
      alt: 'Kroppsscanning med person och AI-scan-interface',
      art: 'body',
      description: t('home:actionDescriptions.body'),
      image: '/viktkollen-body-scan.png',
      imageHeight: 1537,
      imageWidth: 1023,
      icon: 'bodyScan',
      label: t('home:labels.bodyScan'),
      onClick: () => (onOpenBodyScan ? onOpenBodyScan() : goTo('progress', 'body-analysis')),
      onScan: onStartBodyScan || (() => goTo('progress', 'body-analysis')),
    },
    {
      accent: 'food',
      actionIcon: 'foodCamera',
      alt: 'AI-matscanning av måltid',
      art: 'meal',
      description: t('home:actionDescriptions.food'),
      image: '/viktkollen-meal-scan.png',
      imageHeight: 1536,
      imageWidth: 1024,
      icon: 'foodCamera',
      label: 'Matscanning',
      onClick: onOpenFoodScan || (() => goTo('nutrition', 'streckkod')),
      onScan: onScanFood || (() => goTo('nutrition', 'nutrition-scanner-v2')),
    },
  ]

  return (
    <section className="overview-primary-actions" aria-label={t('home:labels.home')}>
      {actions.map((action) => {
        const visual = (
          <>
            <span className="overview-primary-visual">
              <span className="overview-primary-orbit" />
              <span className={`overview-primary-art is-${action.art}`}>
                {action.image ? (
                  <img
                    alt={action.alt}
                    decoding="async"
                    height={action.imageHeight}
                    loading="lazy"
                    src={action.image}
                    width={action.imageWidth}
                  />
                ) : (
                  <OverviewIcon name={action.icon} />
                )}
                {action.art === 'body' ? <BodyScanRings /> : null}
              </span>
              <span className="overview-primary-action-icon">
                <OverviewIcon name={action.icon} />
              </span>
            </span>
            <span className="overview-primary-action-copy">
              <strong>{action.label}</strong>
              <small>{action.description}</small>
            </span>
          </>
        )

        if (action.accent === 'body' || action.accent === 'food') {
          return (
            <div className={`overview-primary-action is-${action.accent}`} key={action.label}>
              <button
                className="overview-primary-action-hit"
                type="button"
                aria-label={action.accent === 'body' ? 'Öppna kroppsscanning i helskärm' : 'Läs ingredienser'}
                onClick={action.onClick}
              >
                {visual}
                <span className="overview-tap-me">tap me</span>
              </button>
              <button
                className="overview-primary-action-chevron"
                type="button"
                aria-label={action.accent === 'body' ? 'Skanna kropp med kamera' : 'Skanna mat med kamera'}
                onClick={action.onScan}
              >
                <OverviewIcon name="foodCamera" />
              </button>
            </div>
          )
        }

        return (
          <div className={`overview-primary-action is-${action.accent}`} key={action.label}>
            <button
              className="overview-primary-action-hit"
              type="button"
              aria-label={action.accent === 'eyes' ? t('home:labels.openAiEyes') : t('home:labels.openAiCoach')}
              onClick={action.onClick}
            >
              {visual}
              <span className="overview-tap-me">tap me</span>
            </button>
            <button
              className="overview-primary-action-chevron"
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={action.onClick}
            >
              <OverviewIcon name={action.actionIcon} />
            </button>
          </div>
        )
      })}
    </section>
  )
}

function formatTodayWeightDelta(change7d) {
  if (!Number.isFinite(Number(change7d))) return ''
  const value = Number(change7d)
  if (Math.abs(value) < 0.05) return '→ 0 kg'
  const formatted = formatSignedChange(value, 'kg')
  return value < 0 ? formatted.replace('−', '↓ ') : formatted.replace('+', '↑ ')
}

function OverviewHeroStats({
  caloriesToday,
  calorieGoal,
  checkIn,
  currentWeight,
  featureFlags,
  healthScore,
  onLogWeight,
  onOpenCoach,
  onScanFood,
  proteinToday,
  proteinGoal,
  weightTrend,
  weights,
}) {
  const { t } = useTranslation(['common', 'home'])
  const caloriePercent = getProgressPercent(caloriesToday, calorieGoal)
  const displayWeight = resolveHomeWeightKg({ currentWeight, weights })
  const hasCurrentWeight = isFiniteNumber(displayWeight) && Number(displayWeight) > 0
  const hasCalories = isFiniteNumber(caloriesToday)
  const stepsState = resolveHomeSteps({ checkIn })
  const stepsLabel = formatHomeStepsLabel(stepsState, (value) => formatNumber(Math.round(Number(value))))
  const weightSparklinePoints = getSparklinePoints(measuredWeightsForSparkline(weights))
  const proteinFoods = [
    { id: 'chicken', label: 'Kyckling' },
    { id: 'beef', label: 'Nötkött' },
    { id: 'egg', label: 'Ägg' },
  ]
  const compactStats = [
    {
      accent: 'health',
      icon: 'heart',
      label: t('home:labels.healthScore'),
      secondary: t('home:labels.today'),
      value: isFiniteNumber(healthScore) ? `${Math.round(Number(healthScore))}` : t('common:states.missingData'),
    },
    {
      accent: 'protein',
      icon: 'protein',
      label: t('home:labels.proteinToday'),
      secondary: isFiniteNumber(proteinGoal) ? `Mål ${formatNumber(Math.round(Number(proteinGoal)))} g` : t('common:states.missingData'),
      value: isFiniteNumber(proteinToday) ? `${formatNumber(Math.round(Number(proteinToday)))} g` : '—',
      suffix: isFiniteNumber(proteinToday) && isFiniteNumber(proteinGoal)
        ? `${getProgressPercent(proteinToday, proteinGoal)} %`
        : null,
    },
  ]

  const smartCameraOn = isFeatureEnabled('smartCamera', featureFlags)
  const change7d = Number.isFinite(Number(weightTrend?.change7dKg)) ? Number(weightTrend.change7dKg) : null
  const changeLabel = change7d === null ? '' : formatTodayWeightDelta(change7d)
  const calorieGoalLabel = isFiniteNumber(calorieGoal) ? formatNumber(Math.round(Number(calorieGoal))) : null

  const todayCard = (
    <article className="overview-main-stat is-today">
      <div className="overview-main-stat-top">
        <span>{t('home:labels.today')}</span>
      </div>
      <div className="overview-today-pair">
        <div className="overview-today-metric is-steps">
          <span>{t('home:labels.stepsToday')}</span>
          <strong className={stepsState.connected ? undefined : 'is-empty'}>{stepsLabel}</strong>
        </div>
        <div className="overview-today-metric is-weight">
          <span>{t('home:labels.weight')}</span>
          <strong className={hasCurrentWeight ? 'overview-weight-value' : 'overview-weight-value is-empty'}>
            {formatHomeWeightLabel(displayWeight)}
          </strong>
          {change7d !== null && hasCurrentWeight ? (
            <small className={`overview-weight-delta is-${weightTrend?.trend || 'stable'}`}>{changeLabel}</small>
          ) : null}
        </div>
      </div>
      <div className="overview-today-calories">
        <span>{t('home:labels.calories')}</span>
        <span className="overview-metric-icon is-inline" aria-hidden="true"><OverviewIcon name="flame" /></span>
        <strong className={hasCalories ? undefined : 'is-empty'}>
          {hasCalories
            ? `${formatNumber(Math.round(Number(caloriesToday)))}${calorieGoalLabel ? ` / ${calorieGoalLabel}` : ''} kcal`
            : t('common:states.noneYet')}
        </strong>
      </div>
      <small>{hasCurrentWeight ? t('home:labels.weight') : t('home:states.registerWeight')}</small>
      <div className="overview-weight-chart">
        {weightSparklinePoints && (
          <svg className="overview-weight-sparkline" viewBox="0 0 72 18" role="img" aria-label={t('home:weightTrendAria')}>
            <polyline points={weightSparklinePoints} />
          </svg>
        )}
      </div>
      {caloriePercent !== null && (
        <span className="overview-calorie-progress" aria-hidden="true">
          <span className={`overview-progress-${getProgressBucket(caloriePercent)}`} />
        </span>
      )}
      <div className="overview-today-links">
        {onLogWeight && (
          <button className="overview-stat-link" type="button" onClick={onLogWeight}>{t('home:states.registerWeight')}</button>
        )}
        {onScanFood && (
          <button className="overview-stat-link" type="button" onClick={onScanFood}>{t('home:logFood')}</button>
        )}
      </div>
    </article>
  )

  return (
    <section className="overview-hero-stats" aria-label={t('home:labels.today')}>
      <div className={`overview-main-stats${smartCameraOn ? ' has-coach-slot' : ' is-today-only'}`} aria-label={t('home:labels.aiCoach')}>
        {smartCameraOn ? (
          <article className="overview-main-stat is-coach-hero">
            <div className="overview-main-stat-top">
              <span className="overview-metric-icon" aria-hidden="true"><OverviewIcon name="robot" /></span>
              <span>{t('home:labels.aiCoach')}</span>
            </div>
            <strong>{t('home:personalAdvice')}</strong>
            <small>{t('home:fromYourData')}</small>
            {onOpenCoach && (
              <button className="overview-stat-link" type="button" onClick={onOpenCoach}>{t('home:labels.openAiCoach')}</button>
            )}
          </article>
        ) : null}
        {todayCard}
      </div>

      <div className="overview-compact-tabs" aria-label="Kompakta dagliga stats">
        {compactStats.map((stat) => (
          <article className={`overview-compact-tab is-${stat.accent}`} key={stat.label}>
            <span className="overview-compact-icon" aria-hidden="true"><OverviewIcon name={stat.icon} /></span>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
            <small>{stat.suffix || stat.secondary}</small>
          </article>
        ))}
      </div>
      <div className="overview-protein-strip" aria-label="Bra proteinkällor">
        <strong>Protein att välja</strong>
        {proteinFoods.map((food) => (
          <span key={food.id}>{food.label}</span>
        ))}
      </div>
    </section>
  )
}

function OverviewCheckInAction({ onNavigateSection }) {
  const goToCheckIn = () => {
    if (onNavigateSection) {
      onNavigateSection('nutrition', 'checkin')
      return
    }

    scrollToTarget('checkin')
  }

  return (
    <button className="overview-checkin-action" type="button" onClick={goToCheckIn}>
      <span className="overview-checkin-icon" aria-hidden="true"><OverviewIcon name="check" /></span>
      <span>
        <strong>Dagens check-in</strong>
        <small>Energi, steg, humör och rörelse</small>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  )
}

const secondarySectionIcons = {
  'Dagens måltidsplan': 'mealPlan',
  'Senaste 7 dagarna': 'trend',
  Achievements: 'trophy',
  'Health Prediction': 'prediction',
}

function CollapsibleDashboardSection({ children, id, title }) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <details
      className="overview-secondary-details"
      id={id}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary>
        <span className="overview-secondary-icon" aria-hidden="true"><OverviewIcon name={secondarySectionIcons[title] || 'arrow'} /></span>
        <span>{title}</span>
      </summary>
      {isOpen && (
        <div className="overview-secondary-content">{children}</div>
      )}
    </details>
  )
}

function OverviewDashboard({
  adaptiveCoachFeedback,
  calorieGoal,
  caloriesToday,
  chatInput,
  checkIn,
  currentWeight,
  email,
  featureFlags,
  foods,
  goalsHabits,
  healthScore,
  healthSnapshot,
  isAiSpeaking,
  isAuthenticated = false,
  isListening,
  isVoiceConversationActive,
  isVoiceMuted,
  meals,
  nutritionGoals,
  onAddMeal,
  onEditProfile,
  onLogWeight,
  onNavigateSection,
  onOpenAiCoach,
  onScanFood,
  onSendChatMessage,
  onStartVoiceInput,
  onStopAiVoiceResponse,
  onToggleVoiceMute,
  onVoiceCleanup,
  onAvatarLiveContextChange,
  onAvatarSurfaceChange,
  onChatInputChange,
  profile,
  proteinGoal,
  proteinToday,
  reminderState,
  selectedDate,
  syncStatus,
  voiceStatus,
  weights,
}) {
  const { t } = useTranslation(['common', 'home'])
  const [now, setNow] = useState(() => new Date())
  const [bodyScanOpen, setBodyScanOpen] = useState(false)
  const [smartCameraOpen, setSmartCameraOpen] = useState(false)
  const [coachOpen, setCoachOpen] = useState(false)
  const [foodScanOpen, setFoodScanOpen] = useState(false)
  const [socialOpen, setSocialOpen] = useState(false)
  const [socialView, setSocialView] = useState('inbox')
  const [socialConversationId, setSocialConversationId] = useState(null)
  const [socialPreview, setSocialPreview] = useState([])
  const [socialLoading, setSocialLoading] = useState(false)
  const [socialError, setSocialError] = useState('')
  const [weatherStatus, setWeatherStatus] = useState('')
  const [profilePhoto, setProfilePhoto] = useState(() => readProfilePhoto())
  const [weather, setWeather] = useState(() => createFallbackWeatherContext())
  const flags = featureFlags || getFeatureFlags()
  const weightTrend = useMemo(() => buildWeightTrend(weights, currentWeight), [currentWeight, weights])
  const liveContext = useMemo(() => createOverviewLiveContext(now, weather), [now, weather])
  const initials = getInitials(profile, email)
  const hasPendingNotifications = Boolean(
    reminderState?.reminders?.some((reminder) => !reminder.completed && !reminder.dismissed)
      || reminderState?.notificationsV3?.items?.some((notification) => !notification.completed && !notification.dismissed),
  )
  const coachAdvice = isFiniteNumber(proteinToday) && isFiniteNumber(proteinGoal) && Number(proteinGoal) > 0
    ? `JUST NU. Du har nått ${getProgressPercent(proteinToday, proteinGoal)} % av proteinmålet. Kyckling, nötkött eller ägg kan hjälpa dig vidare.`
    : 'Coach tar dina mål, måltider och vanor och ger ett konkret nästa steg.'

  const goToNotifications = () => {
    scrollToTarget('smart-notifications')
  }

  async function connectWeather() {
    setWeatherStatus('Hämtar väder…')
    try {
      const nextWeather = await loadOverviewWeather({ preferDevice: true })
      setWeather(nextWeather)
      setWeatherStatus('')
    } catch {
      setWeatherStatus(t('home:weatherNotConnected', { defaultValue: 'Väder ej anslutet' }))
    }
  }

  function onAvatarClick() {
    if (!profilePhoto) {
      document.getElementById('overview-profile-photo-input')?.click()
      return
    }
    onEditProfile()
  }

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const dataUrl = await createProfilePhotoFromFile(file)
      setProfilePhoto(writeProfilePhoto(dataUrl))
    } catch {
      setProfilePhoto(readProfilePhoto())
    }
  }

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000)

    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    let cancelled = false

    loadOverviewWeather({ preferDevice: false }).then((nextWeather) => {
      if (!cancelled) {
        setWeather(nextWeather)
        setWeatherStatus('')
      }
    }).catch(() => {
      if (!cancelled) setWeatherStatus(t('home:weatherNotConnected', { defaultValue: 'Väder ej anslutet' }))
    })

    getWeatherPermissionState().then(async (permissionState) => {
      if (cancelled || permissionState !== 'granted') return
      try {
        const nextWeather = await loadOverviewWeather({ preferDevice: true })
        if (!cancelled) setWeather(nextWeather)
      } catch {
        // Keep the city forecast already loaded.
      }
    })

    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    if (!isFeatureEnabled('social', flags) || !isAuthenticated) {
      return undefined
    }

    let cancelled = false
    createSocialApi()
      .listHomePreview()
      .then((rows) => {
        if (cancelled) return
        setSocialPreview(rows)
        setSocialError('')
        setSocialLoading(false)
      })
      .catch((caught) => {
        if (cancelled) return
        setSocialPreview([])
        setSocialError(caught?.message || 'Kunde inte hämta vänner.')
        setSocialLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [flags, isAuthenticated])

  return (
    <div className="home-overview-shell">
      <header className="overview-app-header">
        <h1 className="sr-only">Hem</h1>
        <OverviewLiveMeta
          liveContext={liveContext}
          onConnectWeather={connectWeather}
          weatherStatus={weatherStatus}
        />
        <div className="overview-header-actions">
          <button
            aria-label="Visa smarta notiser"
            className={hasPendingNotifications ? 'overview-notification-button has-pending' : 'overview-notification-button'}
            type="button"
            onClick={goToNotifications}
          >
            <OverviewIcon name="bell" />
          </button>
          <div className="overview-avatar-wrap">
            <button
              aria-label={profilePhoto ? 'Öppna profilinställningar' : 'Lägg till profilbild'}
              className={profilePhoto ? 'overview-avatar-button has-photo' : 'overview-avatar-button'}
              type="button"
              onClick={onAvatarClick}
            >
              {profilePhoto ? <img alt="" src={profilePhoto} /> : initials}
            </button>
            <input
              accept="image/*"
              className="sr-only"
              id="overview-profile-photo-input"
              type="file"
              onChange={handleProfilePhotoChange}
            />
          </div>
        </div>
      </header>

      <section className="overview-home-section" aria-label="Starta">
        <OverviewPrimaryActions
          featureFlags={flags}
          onNavigateSection={onNavigateSection}
          onOpenBodyScan={() => setBodyScanOpen(true)}
          onOpenCoach={() => (onOpenAiCoach ? onOpenAiCoach() : setCoachOpen(true))}
          onOpenFoodScan={() => setFoodScanOpen(true)}
          onOpenSmartCamera={() => {
            setBodyScanOpen(false)
            setSmartCameraOpen(true)
          }}
          onScanFood={onScanFood}
          onStartBodyScan={() => {
            if (onNavigateSection) onNavigateSection('progress', 'body-analysis')
            else scrollToTarget('body-analysis')
          }}
        />
      </section>

      <section className="overview-home-section" aria-labelledby="overview-today-title">
        <h2 id="overview-today-title">{t('home:todayMood', { defaultValue: 'Dagens läge' })}</h2>
        <OverviewHeroStats
          calorieGoal={calorieGoal}
          caloriesToday={caloriesToday}
          checkIn={checkIn}
          currentWeight={currentWeight}
          featureFlags={flags}
          healthScore={healthScore}
          onLogWeight={onLogWeight}
          onOpenCoach={() => (onOpenAiCoach ? onOpenAiCoach() : setCoachOpen(true))}
          onScanFood={onScanFood}
          proteinGoal={proteinGoal}
          proteinToday={proteinToday}
          weightTrend={weightTrend}
          weights={weights}
        />
        <HomeSocialPreview
          conversations={isFeatureEnabled('social', flags) && isAuthenticated ? socialPreview : []}
          enabled={isFeatureEnabled('social', flags)}
          error={isFeatureEnabled('social', flags) && isAuthenticated ? socialError : ''}
          isAuthenticated={isAuthenticated}
          loading={isFeatureEnabled('social', flags) && isAuthenticated ? socialLoading : false}
          onAddFriend={() => {
            setSocialView('search')
            setSocialOpen(true)
          }}
          onOpenChat={(row) => {
            setSocialView(row?.conversationId ? 'thread' : 'inbox')
            setSocialConversationId(row?.conversationId || null)
            setSocialOpen(true)
          }}
        />
        <OverviewCheckInAction onNavigateSection={onNavigateSection} />
      </section>

      <section className="overview-home-section" aria-labelledby="overview-advice-title">
        <h2 id="overview-advice-title">{t('home:adviceAndNotices', { defaultValue: 'Råd och notiser' })}</h2>
        <div className="overview-attention-grid">
        <DailyCoachCard
          calorieGoal={calorieGoal}
          caloriesToday={caloriesToday}
          healthScore={healthScore}
          onAddMeal={onAddMeal}
          onLogWeight={onLogWeight}
          onScanFood={onScanFood}
          proteinGoal={proteinGoal}
          proteinToday={proteinToday}
          showActions={false}
          steps={checkIn?.steps}
          title="Dagens råd"
        />
        <div className="overview-smart-notifications" id="smart-notifications">
          <SmartNotificationsCard
            adaptiveCoachFeedback={adaptiveCoachFeedback}
            checkIn={checkIn}
            goalsHabits={goalsHabits}
            healthSnapshot={healthSnapshot}
            meals={meals}
            nutritionGoals={nutritionGoals}
            profile={profile}
            reminderState={reminderState}
            syncStatus={syncStatus}
            today={selectedDate}
            weights={weights}
          />
        </div>
      </div>
      </section>

      <section className="overview-home-section" aria-label="Viktkollen Live">
        <SmartFeedCard liveContext={liveContext} />
      </section>

      {bodyScanOpen && (
        <OverviewBodyScanStage
          chatInput={chatInput}
          currentWeight={currentWeight}
          isAiSpeaking={isAiSpeaking}
          isListening={isListening}
          isVoiceConversationActive={isVoiceConversationActive}
          isVoiceMuted={isVoiceMuted}
          profile={profile}
          voiceStatus={voiceStatus}
          weather={weather}
          weights={weights}
          onChatInputChange={onChatInputChange}
          onClose={() => setBodyScanOpen(false)}
          onLiveContextChange={onAvatarLiveContextChange}
          onSendChatMessage={onSendChatMessage}
          onStartScan={() => {
            setBodyScanOpen(false)
            if (onNavigateSection) onNavigateSection('progress', 'body-analysis')
            else scrollToTarget('body-analysis')
          }}
          onStartVoiceInput={onStartVoiceInput}
          onStopAiVoiceResponse={onStopAiVoiceResponse}
          onSurfaceChange={onAvatarSurfaceChange}
          onToggleVoiceMute={onToggleVoiceMute}
          onVoiceCleanup={onVoiceCleanup}
          onOpenSmartCamera={isFeatureEnabled('smartCamera', flags) ? () => {
            setBodyScanOpen(false)
            setSmartCameraOpen(true)
          } : undefined}
          smartCameraEnabled={isFeatureEnabled('smartCamera', flags)}
        />
      )}
      {smartCameraOpen && isFeatureEnabled('smartCamera', flags) && (
        <SmartCameraStage
          adapters={{
            onOpenBodyScan: () => {
              setSmartCameraOpen(false)
              if (onNavigateSection) onNavigateSection('progress', 'body-analysis')
              else scrollToTarget('body-analysis')
            },
            onOpenFoodScan: () => {
              setSmartCameraOpen(false)
              setFoodScanOpen(true)
            },
            weather,
          }}
          featureFlags={flags}
          isMicrophoneActive={Boolean(isVoiceConversationActive) && !isVoiceMuted}
          voiceBar={(
            <BodyAvatarTalkBar
              chatInput={chatInput}
              isAiSpeaking={isAiSpeaking}
              isListening={isListening}
              isVoiceConversationActive={isVoiceConversationActive}
              isVoiceMuted={isVoiceMuted}
              showText={false}
              voiceStatus={voiceStatus}
              onChatInputChange={onChatInputChange}
              onSendChatMessage={onSendChatMessage}
              onStartVoiceInput={onStartVoiceInput}
              onStopAiVoiceResponse={onStopAiVoiceResponse}
              onToggleVoiceMute={onToggleVoiceMute}
            />
          )}
          onClose={() => setSmartCameraOpen(false)}
          onSurfaceChange={onAvatarSurfaceChange}
          onVoiceCleanup={onVoiceCleanup}
        />
      )}
      {coachOpen && (
        <OverviewCoachStage
          advice={coachAdvice}
          onClose={() => setCoachOpen(false)}
          onOpenCoach={() => {
            setCoachOpen(false)
            if (onNavigateSection) onNavigateSection('coach', 'chat')
            else scrollToTarget('chat')
          }}
          proteinGoal={proteinGoal}
          proteinToday={proteinToday}
        />
      )}
      {foodScanOpen && (
        <OverviewFoodScanStage onClose={() => setFoodScanOpen(false)} />
      )}
      {socialOpen && isFeatureEnabled('social', flags) && (
        <SocialStage
          enabled
          initialConversationId={socialConversationId}
          initialView={socialView}
          isAuthenticated={isAuthenticated}
          onClose={() => setSocialOpen(false)}
        />
      )}

      <section className="overview-more-section home-last-content" aria-labelledby="overview-more-title">
        <h2 id="overview-more-title">{t('home:moreForToday')}</h2>
        <CollapsibleDashboardSection id="meal-planner" title="Dagens måltidsplan">
          <DailyMealPlannerCard
            date={selectedDate}
            meals={meals}
            nutritionGoals={nutritionGoals}
          />
        </CollapsibleDashboardSection>
        <CollapsibleDashboardSection id="weekly-progress" title="Senaste 7 dagarna">
          <WeeklyProgressSection
            checkIn={checkIn}
            foods={foods}
            healthSnapshot={healthSnapshot}
            meals={meals}
            nutritionGoals={nutritionGoals}
            selectedDate={selectedDate}
          />
        </CollapsibleDashboardSection>
        <CollapsibleDashboardSection id="achievements" title="Achievements">
          <AchievementPreviewCard
            adaptiveCoachFeedback={adaptiveCoachFeedback}
            analysisDate={selectedDate}
            checkIn={checkIn}
            goalsHabits={goalsHabits}
            healthSnapshot={healthSnapshot}
            meals={meals}
            nutritionGoals={nutritionGoals}
            profile={profile}
            reminderState={reminderState}
            weights={weights}
          />
        </CollapsibleDashboardSection>
        <CollapsibleDashboardSection id="health-prediction" title="Health Prediction">
          <HealthPredictionCard
            adaptiveCoachFeedback={adaptiveCoachFeedback}
            analysisDate={selectedDate}
            checkIn={checkIn}
            foods={foods}
            goalsHabits={goalsHabits}
            healthSnapshot={healthSnapshot}
            meals={meals}
            nutritionGoals={nutritionGoals}
            profile={profile}
            reminderState={reminderState}
            weights={weights}
          />
        </CollapsibleDashboardSection>
      </section>
    </div>
  )
}

export default memo(OverviewDashboard)
