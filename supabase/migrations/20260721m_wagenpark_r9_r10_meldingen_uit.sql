-- Belmeldingen voor R9/R10 standaard uit.
--
-- De regels leveren honderden bevindingen per maand op. Een in-app melding per
-- bevinding maakt het belletje onbruikbaar, terwijl de signalen gewoon op
-- /wagenpark/bevindingen staan en daar te filteren en af te handelen zijn.
--
-- De schakelaar staat in drempel_config zodat hij via Wagenpark > Instellingen
-- aan te zetten is zonder codewijziging. Zet meld_in_app op true zodra het
-- aantal nieuwe signalen per check klein genoeg is om te willen zien; er geldt
-- dan nog steeds een venster van veertien dagen, zodat een inhaalslag over oude
-- dagen nooit als melding uitgaat.

update public.handboek_regels
   set drempel_config = drempel_config || jsonb_build_object('meld_in_app', false),
       gewijzigd_op = now()
 where code in ('R9', 'R10');
