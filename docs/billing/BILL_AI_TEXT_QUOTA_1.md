# BILL-AI-TEXT-QUOTA-1: kvot för AI-text

Grenen är `claude/bill-ai-cost-gate-1`. `origin/main` (`8f85d84`, SumUp-adaptern)
är mergad in först, utan konflikter; commiten rör bara
`api/_shared/billing/checkoutIntent.js`, `paymentProviderContract.js`,
`providerWebhookIngress.js` och `providers/sumup*`. Ingen migration är skapad
och ingenting i produktion är ändrat.

## Vad som ändrats

Kvoten för `ai.text.request` tillämpas nu på servern före varje OpenAI-anrop.
Det gäller:
- `POST /api/ai`, alla fem OpenAI-actions: chat, daily-coach, weekly-report,
  proactive-coach och study-buddy. Alla går genom `callOpenAI`;
- `POST /api/adaptive-coach`.

Kvoten använder samma durable metered-livscykel och kvotmotor som AI Ögat
(`api/_shared/billing/aiTextLiveBilling.js`, med samma mönster som
`aiEyeLiveBilling.js`). Ordningen är:

1. **AUTH:** en verifierad Supabase-användare (UUID).
2. **Server-plan:** planen kommer ur serverns plantilldelning i kvotmotorn
   (`user_plan_assignments` eller `reserve_quota` i produktion). En okänd plan
   ger `DENIED_UNKNOWN_PLAN`.
3. **Entitlement:** `ai.text.request`, feature- och provider-kontroller samt
   kostnadsspärr, via `evaluateBillingOperation`.
4. **Reservera en kvotenhet.**
5. **Dispatch-claim**, i den durable operation-storen.
6. **OpenAI.**
7. **Commit och användningshändelse.**

Om OpenAI bevisligen aldrig startade görs en rollback.

## Kvoter

Kvoterna kommer ur planmatrisen och är oförändrade:

| Plan | Enheter per månad |
|---|---|
| Free | **20** |
| 04 | 30 |
| 07 | 50 |
| 09 | 70 |
| 12 | 90 |
| 15 | 120 |
| 19 | 160 |
| 29 | 250 |

## Semantik

| Fall | Beteende |
|---|---|
| Kvoten slut | 429 `RATE_LIMITED` före OpenAI, 0 OpenAI-anrop. Kvotnekandet göms inte bakom en mock-fallback. |
| Ingen entitlement eller feature avstängd | 403 före OpenAI |
| Billing-storen otillgänglig | 503 före OpenAI (stängt vid fel) |
| OpenAI startade aldrig (dispatch-claim misslyckas) | Reservationen återförs (rollback). Inget debiteras. |
| OpenAI felar efter dispatch | Enligt befintlig semantik ("aldrig bevisat icke-debiterbart") bekräftas en enhet (commit). `/api/ai` behåller sin befintliga fallback, och `adaptive-coach` sitt befintliga felsvar. |
| Samma försök igen (`x-viktkollen-request-id`, per route eller action) | Samma operation: 409, inget nytt OpenAI-anrop och ingen ny enhet |
| Deterministiska svar (osäker chattfråga, ingen API-nyckel) | Ingen kvot används |

Klientens påståenden (plan, premium, kvar-kvot, admin) ignoreras.

## Tester

- **`api/ai/aiTextQuota.test.js`** (15 tester):
  - Free: 20 enheter över alla fem actions, en per anrop och reserverad före
    OpenAI. Den 21:a nekas i alla actions med 0 anrop.
  - Premium: förbi Free-kvoten; när den egna kvoten är slut nekas förfrågan
    med 0 anrop.
  - Förfalskad Premium och förfalskad kvot ignoreras.
  - Okänd plan, avstängd feature och otillgänglig store nekas.
  - Rollback när OpenAI aldrig startade.
  - Commit utan dubbeldebitering vid fel efter dispatch.
  - Omspelning per action.
  - Deterministiska svar använder ingen kvot.
  - `adaptive-coach` testas separat: Free, Premium, omspelning och fel.
- **`api/ai/index.test.js` och `api/adaptive-coach/index.test.js`:** installerar
  billing-runtime för test och använder UUID som användar-id. Testernas krav
  är oförändrade.
