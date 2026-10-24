-- Disposable fixture: the actual renewal table already has created_at.
alter table billing.sumup_renewal_attempts add column if not exists created_at timestamptz not null default now();
