-- Wat is nieuw: klantportaal per contactpersoon, nieuwe dossiers vanzelf erin.
-- Toegepast op 2026-10-16, nadat de wijziging op main stond.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-16','verbeterd','Klantportaal','Klantportaal per contactpersoon, nieuwe dossiers komen er vanzelf in',
   'Op de pagina van een contactpersoon geef je nu in één keer toegang tot het klantportaal. Kies of iemand alleen zijn eigen dossiers ziet, of, bijvoorbeeld als manager, alle dossiers van zijn organisatie. Nieuwe dossiers verschijnen daarna vanzelf in zijn portaal, met de onderdelen die je onder Instellingen, Klantportaal als standaard kiest. Een dossier dat je op de tab Klantportaal bewust dichtzet, blijft dicht.');
