-- Het item van vanochtend beschreef nog dat een verlegd tarief 0% rekent. Dat gedrag is
-- dezelfde dag gewijzigd (zie 20260806b): een verlegd tarief heft zijn eigen percentage.
-- We corrigeren de bestaande regel in plaats van er een tegenstrijdig item naast te zetten;
-- `aangemaakt_op` blijft daardoor staan, zodat de ongelezen-teller niet opnieuw afgaat.
update public.changelog
set omschrijving =
  'In het rekenblad kon je maar drie BTW-percentages kiezen, terwijl er bij de stamgegevens zes tarieven staan. Voortaan zie je precies dezelfde lijst als op de pagina BTW-tarieven, met de naam erbij. Kies je een verlegd tarief, dan rekent de offerte dat percentage gewoon en telt het bedrag mee in het totaal; onder het totaal komt de vermelding dat er een verlegd tarief is gebruikt.'
where datum = '2026-08-06'
  and module = 'Calculatie'
  and titel = 'Alle BTW-tarieven kiesbaar, ook de verlegde';
