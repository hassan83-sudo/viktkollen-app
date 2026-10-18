# AI Help: verified knowledge and concrete answers

## Cause and correction

The previous plan answer used a knowledge entry explaining where Settings
is, plus preliminary static prices and the free-plan quotas. It never read
the live plan comparison, so it could not explain what the price difference
bought. The model price filter allowed known static prices even without a
verified customer price. Feature follow-ups without pinned feature IDs could
also lose their subject and retrieve unrelated entries or only compact titles.

Public plan questions now reuse `readPlanComparison`, exactly as
`/api/billing/plans` does. Prices, numerical quotas, available unlimited-feature
entries and pairwise numerical differences are rendered from its returned
cards, without an LLM call. There is no 9/19-specific answer or premium gate.
Any active plan returned by that reader can be compared. Explicit price
requests select matching cards; a request for all plans lists the catalog.
Successive referential follow-ups carry only previous user questions, stop
at unrelated topics/actions and never treat assistant prose or client-supplied
plan values as a data source. Personal account questions still follow the
existing authenticated customer-context path.

Missing live data, unknown requested prices and incomplete quotas are stated
explicitly; static quota tables do not fill the gaps. General model replies
can no longer pass a price merely because it occurs in the preliminary catalog.
Only verified personal prices may appear in model text. Decimal amounts are
compared as decimals, not truncated to an allowed integer price.

## Other knowledge areas

- Food scanning: recognizes both Swedish spellings and food scan; explains
  estimated amounts, checking ingredients and the limits of a barcode. Facts
  checked against `NutritionScannerV2.jsx` and its editable ingredient results.
- Body scanning: recognizes kroppsskanning as well as kroppsscanning; retains
  the guided camera description and explicitly distinguishes estimates from
  medical measurements. No claims that AI Help can see the camera.
- AI Ear: describes recording/analysis and browser dictation separately. Removes
  the obsolete blanket assertion that the melody route is disconnected; the
  existing route is restricted to an active admin and signed clip consent,
  as documented by `aiEarModes.js` and enforced by `aiEarHummingRoute.js`.
- Profile and ordinary feature questions: referential follow-ups retrieve full,
  bounded entries from the prior user topic, rather than inventing a referent.
- Payment/quota/account troubleshooting: existing verified customer readers,
  authentication, confirmation and missing-evidence behavior are preserved.
  Prompt instructions now require facts and limitations before navigation,
  with a specific clarification when the information or referent is missing.

## Limits

The plan reader exposes active SEK plans with whole-krona monthly prices and
its existing quota-card shape. This change does not extend that billing
contract, change quotas, certify sale availability, or infer quota periods,
daily safety caps or missing entitlements. Incomplete cards are reported as
incomplete. Human support is never inferred from a plan price.

Plan answer labels are supplied in Swedish, English, Spanish and Arabic;
other languages explicitly report English fallback in response metadata.
Model-assisted feature explanations still depend on provider availability
and the existing 400-token/shared-budget/user-rate controls. This sprint does
not guarantee arbitrary model wording or audit every catalog entry.

## Verification

184 tests passed in the affected AI Help/client/customer-action/plan-reader
suite. After the last plan-selection/price-guard adjustments, all 11 updated
plan tests passed, including unknown-price and multi-step follow-ups. One
Windows sandbox cache rename failed with EPERM; the affected test was rerun
successfully outside the sandbox. Targeted ESLint, diff whitespace checks and
the Vite build passed (existing chunk-size warning).

Coverage includes 9 versus 19, every fixture catalog plan, changed live reader
values, missing data in four languages, incomplete quotas, untrusted client
plans/user IDs, unsupported prices, invented model prices and decimal price
mismatches. Food/body/Ear/profile follow-ups retrieve concrete facts without
trusting assistant history. Existing authentication, paid support eligibility,
account confirmation and shared cost-store tests continue to pass.

All data-dependent tests use mocks/fixtures. No live Production or Staging
integration is claimed. No database, environment, payment or Production
changes were performed, and no new account/payment actions were activated.
