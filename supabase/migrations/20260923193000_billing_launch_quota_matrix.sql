-- BILL-6B3A launch commercial quota matrix.
-- Local migration only. Do not apply to production in this sprint.
-- Does not change plan prices.
-- Does not insert paid-plan sale rows. Missing sale rows stay off.

update billing.plan_entitlements as entitlement
set
  limit_kind = 'NUMBER',
  limit_value = approved.limit_value,
  quota_status = 'PRELIMINARY'
from (
  values
    ('plan.free', 'ai.text.request', 20),
    ('plan.free', 'food.scan', 5),
    ('plan.free', 'body.scan', 3),
    ('plan.free', 'ai.eye.analysis', 25),
    ('plan.prelim.sek.month.04', 'ai.text.request', 30),
    ('plan.prelim.sek.month.04', 'food.scan', 10),
    ('plan.prelim.sek.month.04', 'body.scan', 4),
    ('plan.prelim.sek.month.04', 'ai.eye.analysis', 40),
    ('plan.prelim.sek.month.07', 'ai.text.request', 50),
    ('plan.prelim.sek.month.07', 'food.scan', 15),
    ('plan.prelim.sek.month.07', 'body.scan', 6),
    ('plan.prelim.sek.month.07', 'ai.eye.analysis', 60),
    ('plan.prelim.sek.month.09', 'ai.text.request', 70),
    ('plan.prelim.sek.month.09', 'food.scan', 20),
    ('plan.prelim.sek.month.09', 'body.scan', 8),
    ('plan.prelim.sek.month.09', 'ai.eye.analysis', 80),
    ('plan.prelim.sek.month.12', 'ai.text.request', 90),
    ('plan.prelim.sek.month.12', 'food.scan', 30),
    ('plan.prelim.sek.month.12', 'body.scan', 10),
    ('plan.prelim.sek.month.12', 'ai.eye.analysis', 100),
    ('plan.prelim.sek.month.15', 'ai.text.request', 120),
    ('plan.prelim.sek.month.15', 'food.scan', 40),
    ('plan.prelim.sek.month.15', 'body.scan', 12),
    ('plan.prelim.sek.month.15', 'ai.eye.analysis', 125),
    ('plan.prelim.sek.month.19', 'ai.text.request', 160),
    ('plan.prelim.sek.month.19', 'food.scan', 55),
    ('plan.prelim.sek.month.19', 'body.scan', 15),
    ('plan.prelim.sek.month.19', 'ai.eye.analysis', 150),
    ('plan.prelim.sek.month.29', 'ai.text.request', 250),
    ('plan.prelim.sek.month.29', 'food.scan', 85),
    ('plan.prelim.sek.month.29', 'body.scan', 25),
    ('plan.prelim.sek.month.29', 'ai.eye.analysis', 250),
    ('plan.prelim.sek.month.39', 'ai.text.request', 350),
    ('plan.prelim.sek.month.39', 'food.scan', 120),
    ('plan.prelim.sek.month.39', 'body.scan', 35),
    ('plan.prelim.sek.month.39', 'ai.eye.analysis', 350),
    ('plan.prelim.sek.month.49', 'ai.text.request', 500),
    ('plan.prelim.sek.month.49', 'food.scan', 160),
    ('plan.prelim.sek.month.49', 'body.scan', 50),
    ('plan.prelim.sek.month.49', 'ai.eye.analysis', 500),
    ('plan.prelim.sek.month.59', 'ai.text.request', 650),
    ('plan.prelim.sek.month.59', 'food.scan', 200),
    ('plan.prelim.sek.month.59', 'body.scan', 65),
    ('plan.prelim.sek.month.59', 'ai.eye.analysis', 650),
    ('plan.prelim.sek.month.69', 'ai.text.request', 800),
    ('plan.prelim.sek.month.69', 'food.scan', 250),
    ('plan.prelim.sek.month.69', 'body.scan', 80),
    ('plan.prelim.sek.month.69', 'ai.eye.analysis', 800),
    ('plan.prelim.sek.month.79', 'ai.text.request', 1000),
    ('plan.prelim.sek.month.79', 'food.scan', 300),
    ('plan.prelim.sek.month.79', 'body.scan', 100),
    ('plan.prelim.sek.month.79', 'ai.eye.analysis', 1000),
    ('plan.prelim.sek.month.89', 'ai.text.request', 1250),
    ('plan.prelim.sek.month.89', 'food.scan', 350),
    ('plan.prelim.sek.month.89', 'body.scan', 125),
    ('plan.prelim.sek.month.89', 'ai.eye.analysis', 1250),
    ('plan.prelim.sek.month.99', 'ai.text.request', 1500),
    ('plan.prelim.sek.month.99', 'food.scan', 400),
    ('plan.prelim.sek.month.99', 'body.scan', 150),
    ('plan.prelim.sek.month.99', 'ai.eye.analysis', 1500)
) as approved(plan_id, feature, limit_value)
where entitlement.plan_id = approved.plan_id
  and entitlement.feature = approved.feature;

update billing.plan_entitlements
set
  limit_kind = 'UNLIMITED',
  limit_value = null
where feature in (
  'friend_chat',
  'gps_standard',
  'ready_avatar',
  'smart_ai',
  'ai.voice.session',
  'tts.request',
  'gps.live.session',
  'ai.ear.interpret'
);
