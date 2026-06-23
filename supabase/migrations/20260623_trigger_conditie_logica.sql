-- EN/OF-keuze voor trigger-condities.
--
-- Tot nu toe werden alle condities van een trigger met AND gecombineerd (Node-evaluator
-- evalCondities → .every). Deze kolom maakt per trigger een keuze mogelijk:
--   'en' = alle condities moeten kloppen (huidige gedrag, default)
--   'of' = ten minste één conditie moet kloppen
-- Tussen triggers blijft het OR (een sjabloon activeert zodra één trigger matcht).

ALTER TABLE public.actielijst_triggers
  ADD COLUMN IF NOT EXISTS conditie_logica text NOT NULL DEFAULT 'en'
  CHECK (conditie_logica IN ('en', 'of'));
