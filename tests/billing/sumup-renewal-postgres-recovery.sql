begin;
insert into billing.subscriptions
 (subscription_id,user_id,plan_id,provider,status,provider_customer_ref,plan_version,current_period_end)
 values ('recovery-sub','recovery-user','plan-1','sumup','ACTIVE','recovery-customer',1,'2026-10-01Z');
insert into billing.sumup_recurring_instruments
 (subscription_id,user_id,provider_customer_ref,status,instrument_fingerprint)
 values ('recovery-sub','recovery-user','recovery-customer','verified',repeat('d',64));
select billing.claim_sumup_renewal_attempt('recovery-ref','recovery-sub','2026-10-01Z');
select billing.bind_sumup_renewal_checkout_draft('recovery-ref','recovery-checkout','recovery-sub','2026-10-01Z','2026-11-01Z');
update billing.subscriptions set cancel_at_period_end=true where subscription_id='recovery-sub';
do $test$
declare result jsonb;
begin
 if not exists (select 1 from billing.list_sumup_renewal_recovery_draft(100) where checkout_reference='recovery-ref') then
   raise exception 'cancelled original attempt disappeared';
 end if;
 result := billing.record_sumup_renewal_observation_draft('recovery-ref','recovery-checkout','paid','00000000-0000-4000-8000-000000000002',false);
 if result->>'state' is distinct from 'review_required' or result->>'reason' is distinct from 'lifecycle_changed' then
   raise exception 'cancelled payment not preserved for review';
 end if;
 perform billing.record_sumup_renewal_observation_draft('recovery-ref','recovery-checkout','unknown',null,true);
 if not exists (select 1 from billing.sumup_renewal_attempts where checkout_reference='recovery-ref'
   and observed_outcome='paid' and observed_transaction_id='00000000-0000-4000-8000-000000000002'
   and status='processing') then raise exception 'verified paid evidence lost'; end if;
 begin
   perform billing.record_sumup_renewal_observation_draft('recovery-ref','recovery-checkout','failed',null,false);
   raise exception 'paid downgraded to failed';
 exception when others then if sqlerrm <> 'renewal_observation_conflict' then raise; end if; end;
 begin
   perform billing.record_sumup_renewal_observation_draft('recovery-ref','recovery-checkout','paid','00000000-0000-4000-8000-000000000003',false);
   raise exception 'verified transaction replaced';
 exception when others then if sqlerrm <> 'renewal_observation_conflict' then raise; end if; end;
 if not exists (select 1 from billing.subscriptions where subscription_id='recovery-sub'
    and cancel_at_period_end and current_period_end='2026-10-01Z'::timestamptz and plan_id='plan-1') then
   raise exception 'observation changed cancelled subscription';
 end if;
 if has_function_privilege('service_role','billing.record_sumup_renewal_observation_draft(text,text,text,text,boolean)','EXECUTE')
   or has_function_privilege('anon','billing.list_sumup_renewal_recovery_draft(integer)','EXECUTE')
   or has_function_privilege('authenticated','billing.list_sumup_renewal_recovery_draft(integer)','EXECUTE') then
   raise exception 'recovery capabilities publicly executable';
 end if;
end;
$test$;
rollback;
