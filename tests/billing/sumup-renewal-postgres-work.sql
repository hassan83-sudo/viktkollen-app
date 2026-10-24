begin;
do $test$
begin
  if (select count(*) from billing.list_sumup_renewal_work_draft(20)) <> 1 then
    raise exception 'eligible renewal missing';
  end if;
  if exists (select 1 from billing.list_sumup_renewal_work_draft(20)
    where amount_minor <> 1900 or customer_id <> 'customer-1' or currency <> 'SEK') then
    raise exception 'wrong trusted billing facts';
  end if;
  update billing.subscriptions set cancel_at_period_end = true;
  if exists (select 1 from billing.list_sumup_renewal_work_draft(20)) then
    raise exception 'cancelled subscription selected';
  end if;
  if has_function_privilege('anon', 'billing.list_sumup_renewal_work_draft(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'billing.list_sumup_renewal_work_draft(integer)', 'EXECUTE')
     or has_function_privilege('service_role', 'billing.list_sumup_renewal_work_draft(integer)', 'EXECUTE') then
    raise exception 'worker reader exposed';
  end if;
end;
$test$;
rollback;
