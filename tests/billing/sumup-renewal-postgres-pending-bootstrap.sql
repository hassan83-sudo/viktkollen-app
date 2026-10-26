-- Disposable fixture only: replace the advance stub with the actual lifecycle migration.
drop function billing.advance_subscription_period(text, timestamptz, text);
