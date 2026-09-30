import { LAUNCH_QUOTA_BY_PLAN } from '../../../src/services/billing/commercialPlanMatrix.js'
import { preliminarySekMonthMajors } from '../../../src/services/billing/planCatalog.js'

export function verifiedPriceMajors() {
  return [0, ...preliminarySekMonthMajors]
}

export function preliminaryPlanFacts() {
  const free = LAUNCH_QUOTA_BY_PLAN['plan.free']
  const prices = preliminarySekMonthMajors.join(', ')
  return [
    'Katalogens priser är preliminära kronor per månad och en administratör styr vilka paket som säljs.',
    'Gratis är 0 kr/mån.',
    `Preliminära betalpriser är ${prices} kr/mån.`,
    `Gratispaketets preliminära kvoter är ${free.ai_text_requests} AI-textanrop, ${free.food_scan_requests} matskanningar, ${free.body_scan_requests} kroppsscanningar och ${free.ai_eye_requests} AI-Ögat-anrop.`,
    'Din egen plan, betalning och uppsägning visas inte här.',
    'SumUp-sandboxen ger inte betald åtkomst av sig själv.',
  ].join(' ')
}
