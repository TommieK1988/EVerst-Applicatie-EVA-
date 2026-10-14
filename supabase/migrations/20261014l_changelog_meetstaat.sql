-- Wat is nieuw: meetstaat vernieuwd (live op 14-10-2026, PR #26).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-14','verbeterd','Calculatie','Meetstaat: overzichtelijker en betrouwbaarder naar de calculatie',
   'Per groep zie je in één oogopslag of er wijzigingen openstaan, en onder elke groep staat per code wat de meetstaat oplevert naast wat er in de calculatie staat. "Verwerk in calculatie" laat eerst zien wat er verandert; je kiest zelf wat mee mag. Vervallen codes en in de calculatie verwijderde regels worden nu goed verwerkt, en een maat zonder hoogte telt niet meer stilletjes als 1 m².',
   'kantoor');
