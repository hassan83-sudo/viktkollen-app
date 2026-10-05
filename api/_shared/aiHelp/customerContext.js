import { QUOTA_STATUS } from '../../../src/services/billing/catalog.js'
import { getKnowledgeEntry } from '../../../src/features/aiHelp/knowledgeCatalog.js'
import { readDurableQuota } from '../billing/quotaRead.js'
import { readDurableUserSubscription } from '../billing/subscriptionRead.js'
import { readUsageSnapshot } from '../billing/usageSnapshotRead.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'

const LAUNCH_FEATURES = Object.freeze([
  'ai.ear.interpret',
  'ai.eye.analysis',
  'ai.text.request',
  'body.scan',
  'food.scan',
])

const FEATURE_FOCUS = Object.freeze([
  Object.freeze({
    feature: 'food.scan',
    key: 'food_scan',
    knowledgeId: 'more.nutrition',
    pattern: /matskann|matscan|food scan|skanna mat/i,
    unit: 'requests',
  }),
  Object.freeze({
    feature: 'body.scan',
    key: 'body_scan',
    knowledgeId: 'feature.body-scan',
    pattern: /kroppsscann|body scan/i,
    unit: 'requests',
  }),
  Object.freeze({
    feature: 'ai.eye.analysis',
    key: 'ai_eye',
    knowledgeId: 'feature.ai-eye',
    pattern: /ai-?ögat|ai eye/i,
    unit: 'requests',
  }),
  Object.freeze({
    feature: 'ai.ear.interpret',
    key: 'ai_ear',
    knowledgeId: null,
    pattern: /ai-?örat|humming|humma|sjung/i,
    unit: 'requests',
  }),
  Object.freeze({
    feature: 'ai.text.request',
    key: 'ai_coach',
    knowledgeId: 'more.coach',
    pattern: /ai-?coach|coach/i,
    unit: 'requests',
  }),
])

const SUBSCRIPTION_FIELDS = Object.freeze([
  'cancel_at_period_end',
  'current_period_end',
  'past_due_grace_until',
  'pending_plan_id',
  'plan_id',
  'status',
])

function matchFeature(question) {
  return FEATURE_FOCUS.find((item) => item.pattern.test(question)) || null
}

export function wantsScheduleCancel(question) {
  const text = String(question || '')
  if (/hur |how do|how can|what happens|ångra|undo|avbryt uppsäg/i.test(text)) return false
  return /(?:avsluta|säg upp|cancel)\s+(?:mitt |mina |min |my )?(?:abonnemang|prenumeration|subscription)/i.test(text)
    || /jag vill (?:avsluta|säga upp)/i.test(text)
    || /i want to cancel my subscription/i.test(text)
}

/**
 * Chooses the smallest verified slice set for this question.
 * Identity is never read from the question.
 */
export function selectCustomerContext(question) {
  const text = String(question || '')
  const feature = matchFeature(text)
  const cancel = wantsScheduleCancel(text)
  const why = /varför kan jag inte|why can.?t i|kan inte använda|cannot use|can't use|doesn.?t work|fungerar inte/i.test(text)
  const personal = /\b(mitt|mina|min|jag|my)\b/i.test(text) || /\bi have\b|\bdo i\b/i.test(text) || /har jag/i.test(text)
  const navigation = /var finns|where is|hur öppnar|hur hittar|öppna /i.test(text)
  const aboutSub = /abonnemang|prenumeration|subscription|förny|renewal|uppsäg|avsluta|cancel/i.test(text)
  const aboutPlan = /\bplan\b|pris|kostar|kostnad|price|paket/i.test(text)
  const aboutUsage = /kvot|kvar|använt|användning|remaining|quota|hur mycket/i.test(text)
  const aboutPay = /betal|payment|grace|förfallen|past due|gick inte igenom/i.test(text)
  const aboutEnt = /ingår|entitlement|planinnehåll/i.test(text)
  const login = /logga in|inlogg|sign in|login/i.test(text)

  const accountTopic = Boolean(feature || login || cancel || why || aboutSub || aboutPlan || aboutUsage || aboutPay || aboutEnt)
  if (!accountTopic || (navigation && !why && !cancel && !aboutUsage && !aboutPay)) {
    return {
      cancel: false,
      direct: false,
      feature: null,
      focus: null,
      personal: false,
      slices: [],
    }
  }

  if (login && !feature && !aboutSub && !aboutUsage && !aboutPay) {
    return {
      cancel: false,
      direct: true,
      feature: null,
      focus: 'login',
      personal: true,
      slices: [],
    }
  }

  if (!personal && !why && !cancel) {
    return {
      cancel: false,
      direct: false,
      feature: null,
      focus: null,
      personal: false,
      slices: [],
    }
  }

  const slices = new Set()
  if (cancel || aboutSub || why) slices.add('subscription')
  if (cancel || aboutPlan || aboutSub || why) slices.add('plan')
  if (aboutUsage || (why && feature) || (feature && /kvar|kvot|använt|remaining/i.test(text))) slices.add('usage')
  if (aboutEnt || (why && (feature || aboutPlan || aboutSub))) slices.add('entitlements')
  if (cancel || aboutPay || why) slices.add('payment')

  let focus = 'subscription'
  if (cancel) focus = 'cancel'
  else if (why) focus = 'access'
  else if (aboutPay) focus = 'payment'
  else if (aboutUsage || (feature && /kvar|använt|kvot/i.test(text))) focus = 'usage'
  else if (aboutEnt) focus = 'entitlements'
  else if (aboutPlan && !aboutSub) focus = 'plan'

  const rephrase = /förklara|enklare|annat sätt|andra ord|mer detalj|utveckla|skillnad|explain|another way/i.test(text)
  return {
    cancel,
    direct: !rephrase,
    feature,
    focus,
    personal: true,
    slices: [...slices],
  }
}

function publicSubscription(subscription) {
  if (!subscription) return null
  const result = {}
  for (const field of SUBSCRIPTION_FIELDS) result[field] = subscription[field] ?? null
  result.cancel_at_period_end = subscription.cancel_at_period_end === true
  return result
}

function publicPlan(plan) {
  if (!plan) return null
  return {
    active: plan.active === true,
    billing_interval: plan.billing_interval || null,
    currency: plan.currency || null,
    enabled_for_sale: plan.enabled_for_sale === true ? true : plan.enabled_for_sale === false ? false : null,
    plan_id: plan.plan_id || null,
    price_minor: Number.isInteger(plan.price_minor) ? plan.price_minor : null,
  }
}

function publicUsage(snapshot) {
  if (!snapshot) return null
  const quotas = (Array.isArray(snapshot.quotas) ? snapshot.quotas : []).map((quota) => ({
    key: quota.key,
    limit: quota.limit,
    remaining: quota.remaining,
    used: quota.used,
  }))
  const unlimited = (Array.isArray(snapshot.unlimited) ? snapshot.unlimited : [])
    .map((item) => item.key)
    .filter(Boolean)
  return { quotas, unlimited }
}

function publicQuota(quota) {
  if (!quota) return null
  return {
    feature: quota.feature || null,
    limit: Number.isInteger(quota.limit) ? quota.limit : null,
    remaining: Number.isInteger(quota.remaining) ? quota.remaining : null,
    status: quota.status || null,
    unlimited: quota.status === QUOTA_STATUS.UNLIMITED || quota.status === QUOTA_STATUS.ALLOWED_UNMETERED,
    used: Number.isInteger(quota.used) ? quota.used : null,
  }
}

function publicEntitlements(rows) {
  if (!Array.isArray(rows)) return null
  return rows
    .filter((row) => LAUNCH_FEATURES.includes(row.feature))
    .map((row) => ({
      enabled: row.enabled === true,
      feature: row.feature,
      limit_kind: row.limit_kind || null,
      limit_value: Number.isInteger(row.limit_value) ? row.limit_value : null,
    }))
}

function publicPayment(subscription) {
  if (!subscription) return null
  return {
    cancel_at_period_end: subscription.cancel_at_period_end === true,
    past_due_grace_until: subscription.past_due_grace_until || null,
    payment_failure_reason: null,
    payment_failure_reason_available: false,
    pending_plan_id: subscription.pending_plan_id || null,
    status: subscription.status || null,
  }
}

async function readPlanAndEntitlements(planId) {
  const client = createSupabaseAdminClient()
  if (!client || typeof client.schema !== 'function') return { entitlements: null, plan: null, unavailable: true }
  const billing = client.schema('billing')
  const planQuery = await billing
    .from('plans')
    .select('plan_id, price_minor, currency, billing_interval, active')
    .eq('plan_id', planId)
    .maybeSingle()
  if (planQuery.error) return { entitlements: null, plan: null, unavailable: true }
  const sale = await billing.rpc('plan_enabled_for_sale', { p_plan_id: planId })
  const entitlementQuery = await billing
    .from('plan_entitlements')
    .select('feature, enabled, limit_kind, limit_value')
    .eq('plan_id', planId)
    .in('feature', [...LAUNCH_FEATURES])
  if (entitlementQuery.error) return { entitlements: null, plan: null, unavailable: true }
  return {
    entitlements: entitlementQuery.data || [],
    plan: {
      ...(planQuery.data || { plan_id: planId }),
      enabled_for_sale: sale.error ? null : sale.data === true,
    },
    unavailable: false,
  }
}

export async function loadCustomerContext({
  feature = null,
  readers = null,
  slices = [],
  userId,
} = {}) {
  if (!userId) {
    return { available: false, reason: 'unauthenticated' }
  }
  const requested = new Set(slices)
  const subscriptionReader = readers?.subscription || readDurableUserSubscription
  const usageReader = readers?.usage || readUsageSnapshot
  const quotaReader = readers?.quota || readDurableQuota
  const planReader = readers?.plan || (async (planId) => readPlanAndEntitlements(planId))

  const context = {
    available: true,
    entitlements: null,
    payment: null,
    plan: null,
    quota: null,
    subscription: null,
    usage: null,
  }

  let subscriptionResult = null
  if (requested.has('subscription') || requested.has('plan') || requested.has('payment') || requested.has('entitlements')) {
    subscriptionResult = await subscriptionReader(userId)
    if (!subscriptionResult || subscriptionResult.unavailable) {
      return { available: false, reason: 'unverified' }
    }
    const subscription = publicSubscription(subscriptionResult.subscription)
    if (requested.has('subscription')) context.subscription = subscription
    if (requested.has('payment')) context.payment = publicPayment(subscriptionResult.subscription)
    if (requested.has('plan') || requested.has('entitlements')) {
      const planId = subscriptionResult.subscription?.plan_id
      if (!planId) return { available: false, reason: 'unverified' }
      const planResult = await planReader(planId)
      if (!planResult || planResult.unavailable) return { available: false, reason: 'unverified' }
      if (requested.has('plan')) context.plan = publicPlan(planResult.plan)
      if (requested.has('entitlements')) context.entitlements = publicEntitlements(planResult.entitlements)
    }
  }

  if (requested.has('usage')) {
    const snapshot = await usageReader(userId)
    context.usage = publicUsage(snapshot)
    if (feature) {
      const quotaResult = await quotaReader({ feature: feature.feature, unit: feature.unit, userId })
      if (!quotaResult || quotaResult.unavailable) return { available: false, reason: 'unverified' }
      context.quota = publicQuota(quotaResult.quota)
    }
    if (!context.usage && !context.quota) return { available: false, reason: 'unverified' }
  }

  return context
}

function isSwedish(languageCode) {
  return languageCode === 'sv'
}

function formatPrice(plan) {
  if (!plan || !Number.isInteger(plan.price_minor) || !plan.currency) return null
  if (plan.currency === 'SEK' && plan.price_minor % 100 === 0) return `${plan.price_minor / 100} kr`
  if (plan.currency === 'SEK') return `${plan.price_minor} öre`
  return null
}

function featureLabel(feature, swedish) {
  const labels = {
    'ai.ear.interpret': swedish ? 'AI-Örat' : 'AI Ear',
    'ai.eye.analysis': swedish ? 'AI-Ögat' : 'AI Eye',
    'ai.text.request': swedish ? 'AI-Coach' : 'AI Coach',
    'body.scan': swedish ? 'kroppsscanning' : 'body scan',
    'food.scan': swedish ? 'matscanning' : 'food scan',
  }
  return labels[feature?.feature] || (swedish ? 'funktionen' : 'the feature')
}

function knowledgeSentence(feature, swedish) {
  const entry = feature?.knowledgeId ? getKnowledgeEntry(feature.knowledgeId) : null
  if (!entry) return swedish
    ? 'Hjälpkatalogen har ingen platsbeskrivning för den här funktionen.'
    : 'The help catalog has no location for this feature.'
  return swedish ? entry.summary : entry.summary
}

export function renderVerifiedAnswer({ context, languageCode = 'sv', selection } = {}) {
  const swedish = isSwedish(languageCode)
  if (!context?.available) {
    return swedish
      ? 'Jag kan inte verifiera kontouppgifterna just nu, så jag gissar inte pris, plan, kvot eller betalning.'
      : 'I cannot verify the account details right now, so I will not guess a price, plan, quota or payment.'
  }
  if (selection?.focus === 'login') {
    return swedish
      ? 'Den här frågan skickades med en giltig inloggning. Jag kan inte se orsaken till ett tidigare inloggningsfel.'
      : 'This question was sent with a valid sign-in. I cannot see the cause of an earlier sign-in failure.'
  }
  if (selection?.focus === 'cancel') return renderCancelOffer({ context, languageCode }).answer
  if (selection?.focus === 'access') return renderAccessAnswer({ context, languageCode, selection })
  if (selection?.focus === 'usage') return renderUsageAnswer({ context, languageCode, selection })
  if (selection?.focus === 'payment') return renderPaymentAnswer({ context, languageCode })
  if (selection?.focus === 'entitlements') return renderEntitlementAnswer({ context, languageCode })
  if (selection?.focus === 'plan') return renderPlanAnswer({ context, languageCode })
  return renderSubscriptionAnswer({ context, languageCode })
}

function renderSubscriptionAnswer({ context, languageCode }) {
  const swedish = isSwedish(languageCode)
  const subscription = context.subscription
  const plan = context.plan
  if (!subscription) {
    return swedish ? 'Ingen verifierad prenumeration hittades.' : 'No verified subscription was found.'
  }
  const price = formatPrice(plan)
  const parts = [
    swedish
      ? `Ditt verifierade abonnemang är ${subscription.plan_id} med status ${subscription.status}.`
      : `Your verified subscription is ${subscription.plan_id} with status ${subscription.status}.`,
  ]
  if (price) parts.push(swedish ? `Priset är ${price} per ${plan.billing_interval || 'period'}.` : `The price is ${price} per ${plan.billing_interval || 'period'}.`)
  if (subscription.current_period_end) {
    parts.push(swedish
      ? `Nuvarande period slutar ${subscription.current_period_end}.`
      : `The current period ends ${subscription.current_period_end}.`)
  }
  if (subscription.cancel_at_period_end) {
    parts.push(swedish ? 'Uppsägning är redan schemalagd till periodens slut.' : 'Cancellation is already scheduled for the end of the period.')
  }
  if (subscription.pending_plan_id) {
    parts.push(swedish
      ? `Ett planbyte till ${subscription.pending_plan_id} väntar.`
      : `A plan change to ${subscription.pending_plan_id} is pending.`)
  }
  return parts.join(' ')
}

function renderPlanAnswer({ context, languageCode }) {
  const swedish = isSwedish(languageCode)
  const plan = context.plan
  const price = formatPrice(plan)
  if (!plan?.plan_id || !price) {
    return swedish
      ? 'Jag kan inte visa ett verifierat pris för planen.'
      : 'I cannot show a verified price for the plan.'
  }
  const sale = plan.enabled_for_sale == null
    ? (swedish ? 'Försäljningsstatus är inte tillgänglig.' : 'The sale status is not available.')
    : plan.enabled_for_sale
      ? (swedish ? 'Planen är markerad som till försäljning.' : 'The plan is marked for sale.')
      : (swedish ? 'Planen är inte markerad som till försäljning.' : 'The plan is not marked for sale.')
  return swedish
    ? `Din verifierade plan är ${plan.plan_id}. Priset är ${price} per ${plan.billing_interval || 'period'} i ${plan.currency}. ${sale}`
    : `Your verified plan is ${plan.plan_id}. The price is ${price} per ${plan.billing_interval || 'period'} in ${plan.currency}. ${sale}`
}

function renderUsageAnswer({ context, languageCode, selection }) {
  const swedish = isSwedish(languageCode)
  const feature = selection?.feature
  if (feature && context.quota) {
    const label = featureLabel(feature, swedish)
    if (context.quota.unlimited) {
      return swedish ? `${label} är obegränsad på din verifierade plan.` : `${label} is unlimited on your verified plan.`
    }
    if (context.quota.used == null || context.quota.remaining == null) {
      return swedish ? `Jag kan inte verifiera kvoten för ${label}.` : `I cannot verify the quota for ${label}.`
    }
    return swedish
      ? `Du har använt ${context.quota.used} av ${context.quota.limit} för ${label}. ${context.quota.remaining} återstår.`
      : `You have used ${context.quota.used} of ${context.quota.limit} for ${label}. ${context.quota.remaining} remain.`
  }
  const quotas = context.usage?.quotas || []
  if (!quotas.length && !(context.usage?.unlimited || []).length) {
    return swedish ? 'Ingen verifierad användning hittades.' : 'No verified usage was found.'
  }
  const lines = quotas.map((quota) => `${quota.key}: ${quota.used}/${quota.limit}, ${quota.remaining} ${swedish ? 'kvar' : 'left'}`)
  const unlimited = (context.usage?.unlimited || []).map((key) => `${key}: ${swedish ? 'obegränsat' : 'unlimited'}`)
  return [...lines, ...unlimited].join(' ')
}

function renderEntitlementAnswer({ context, languageCode }) {
  const swedish = isSwedish(languageCode)
  const rows = context.entitlements || []
  if (!rows.length) return swedish ? 'Inga verifierade rättigheter hittades.' : 'No verified entitlements were found.'
  return rows.map((row) => {
    if (!row.enabled) return `${row.feature}: ${swedish ? 'ingår inte' : 'not included'}`
    if (row.limit_kind === 'UNLIMITED') return `${row.feature}: ${swedish ? 'obegränsat' : 'unlimited'}`
    return `${row.feature}: ${row.limit_value ?? (swedish ? 'okänt tak' : 'unknown limit')}`
  }).join(' ')
}

function renderPaymentAnswer({ context, languageCode }) {
  const swedish = isSwedish(languageCode)
  const payment = context.payment
  if (!payment?.status) return swedish ? 'Ingen verifierad betalningsstatus hittades.' : 'No verified payment status was found.'
  const reason = swedish
    ? 'Orsaken till en misslyckad betalning är inte tillgänglig.'
    : 'The reason for a failed payment is not available.'
  if (payment.status === 'PAST_DUE') {
    const grace = payment.past_due_grace_until
      ? (swedish ? ` Respit gäller till ${payment.past_due_grace_until}.` : ` Grace lasts until ${payment.past_due_grace_until}.`)
      : ''
    return swedish
      ? `Betalningsstatus är PAST_DUE.${grace} ${reason}`
      : `The payment status is PAST_DUE.${grace} ${reason}`
  }
  const pending = payment.pending_plan_id
    ? (swedish ? ` Ett byte till ${payment.pending_plan_id} väntar.` : ` A change to ${payment.pending_plan_id} is pending.`)
    : ''
  const cancel = payment.cancel_at_period_end
    ? (swedish ? ' Uppsägning är schemalagd till periodens slut.' : ' Cancellation is scheduled for the end of the period.')
    : ''
  return swedish
    ? `Betalningsstatus är ${payment.status}.${pending}${cancel} ${reason}`
    : `The payment status is ${payment.status}.${pending}${cancel} ${reason}`
}

function renderAccessAnswer({ context, languageCode, selection }) {
  const swedish = isSwedish(languageCode)
  const feature = selection?.feature
  const label = featureLabel(feature, swedish)
  const entitlement = feature
    ? (context.entitlements || []).find((row) => row.feature === feature.feature)
    : null
  if (feature && context.entitlements && !entitlement) {
    return swedish
      ? `${label} är inte tillgänglig på den verifierade planen. ${knowledgeSentence(feature, swedish)}`
      : `${label} is not available on the verified plan. ${knowledgeSentence(feature, swedish)}`
  }
  if (entitlement && entitlement.enabled === false) {
    return swedish
      ? `${label} ingår inte i din verifierade plan.`
      : `${label} is not included in your verified plan.`
  }
  const quota = context.quota
  if (quota && !quota.unlimited && quota.remaining === 0 && quota.limit != null) {
    return swedish
      ? `Kvoten för ${label} är slut. Du har använt ${quota.used} av ${quota.limit}.`
      : `The quota for ${label} is used up. You have used ${quota.used} of ${quota.limit}.`
  }
  const status = context.payment?.status || context.subscription?.status
  if (status === 'PAST_DUE' || status === 'PAUSED' || status === 'EXPIRED') {
    const reason = swedish
      ? 'Orsaken till en misslyckad betalning är inte tillgänglig.'
      : 'The reason for a failed payment is not available.'
    const grace = context.payment?.past_due_grace_until
      ? (swedish ? ` Respit gäller till ${context.payment.past_due_grace_until}.` : ` Grace lasts until ${context.payment.past_due_grace_until}.`)
      : ''
    return swedish
      ? `Abonnemangsstatus ${status} kan påverka åtkomsten till ${label}.${grace} ${reason}`
      : `Subscription status ${status} may affect access to ${label}.${grace} ${reason}`
  }
  return swedish
    ? `Inget verifierat fel hittades för ${label}. ${knowledgeSentence(feature, swedish)}`
    : `No verified fault was found for ${label}. ${knowledgeSentence(feature, swedish)}`
}

export function renderCancelOffer({ context, languageCode = 'sv' } = {}) {
  const swedish = isSwedish(languageCode)
  if (!context?.available) {
    return {
      answer: swedish
        ? 'Jag kan inte verifiera abonnemanget, så ingen uppsägning har gjorts.'
        : 'I cannot verify the subscription, so no cancellation was made.',
      confirmation: null,
    }
  }
  const subscription = context.subscription
  const open = subscription && ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'].includes(subscription.status)
  if (!open) {
    return {
      answer: swedish
        ? 'Det finns inget öppet abonnemang att säga upp. Inget har ändrats.'
        : 'There is no open subscription to cancel. Nothing was changed.',
      confirmation: null,
    }
  }
  if (subscription.cancel_at_period_end) {
    return {
      answer: swedish
        ? `Uppsägning är redan schemalagd. Perioden slutar ${subscription.current_period_end || 'vid periodens slut'}. Inget nytt har ändrats.`
        : `Cancellation is already scheduled. The period ends ${subscription.current_period_end || 'at the end of the period'}. Nothing new was changed.`,
      confirmation: null,
    }
  }
  const end = subscription.current_period_end || (swedish ? 'periodens slut' : 'the end of the period')
  return {
    answer: swedish
      ? `Uppsägning sker först när du bekräftar knappen. Abonnemanget ${subscription.plan_id} kan då fortsätta till ${end} och avslutas där. Inget har ändrats ännu.`
      : `Cancellation happens only after you confirm the button. Subscription ${subscription.plan_id} can then continue until ${end} and end there. Nothing has been changed yet.`,
    confirmation: { action: 'schedule_cancel' },
  }
}

export function verifiedPriceMinor(context) {
  const price = context?.plan?.price_minor
  return Number.isInteger(price) ? price : null
}
