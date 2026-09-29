-- Office 365-koppeling: onthouden dat Microsoft de koppeling heeft geweigerd.
--
-- Een refresh-token kan door Microsoft worden ingetrokken (wachtwoordwijziging,
-- MFA-reset, ingetrokken sessies, ~90 dagen niet gebruikt). Tot nu toe merkte EVA
-- dat pas op het moment dat iemand een mail verstuurde ("Token verversen mislukt:
-- HTTP 400"), en bleef de medewerkerkaart "Gekoppeld" tonen.
--
-- Met verlopen_op gevuld:
--  - faalt mailen meteen met een begrijpelijke melding (geen nieuwe poging bij Microsoft);
--  - stuurt de volgende login de medewerker automatisch door de koppelflow;
--  - toont de medewerkerkaart "Verlopen" met een knop "Opnieuw koppelen".
-- Een geslaagde (her)koppeling of refresh zet hem weer op null.

alter table public.medewerker_o365_tokens
  add column if not exists verlopen_op    timestamptz,
  add column if not exists verlopen_reden text;

comment on column public.medewerker_o365_tokens.verlopen_op is
  'Moment waarop Microsoft het refresh-token weigerde (invalid_grant). Null = koppeling bruikbaar.';
comment on column public.medewerker_o365_tokens.verlopen_reden is
  'Foutcode/omschrijving van Microsoft bij het weigeren, voor diagnose.';
