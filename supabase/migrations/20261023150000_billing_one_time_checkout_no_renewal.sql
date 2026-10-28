-- Hosted Checkout engångsköp ska inte förnyas.
-- Den regeln finns bara i billing.activate_verified_one_time_checkout
-- (20261026120000), som sätter cancel_at_period_end och en period på 30 dagar.
--
-- Den här filen får inte skriva om billing.activate_verified_checkout.
-- Den gemensamma funktionen behåller cancel_at_period_end = false från
-- 20260926170000, så befintliga och framtida återkommande aktiveringar
-- via den funktionen eller via billing.activate_verified_sumup_setup
-- inte blir engångsköp. Inga befintliga abonnemangsrader ändras här.

do $$
begin
  null;
end $$;
