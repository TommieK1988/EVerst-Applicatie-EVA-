-- Changelog: bestelvenster op de bon werkt weer, en een onderaannemer kan een mandaat krijgen.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','nieuw','Servicedesk','Een onderaannemer een mandaat geven',
   'Bij "Onderaannemerscontract maken" geef je nu per regel aan of het een vaste prijs is of een mandaat. Mandaatregels krijgen een eigen opdrachtbon, met de afspraken erop: in regie, tot welk bedrag er zonder overleg doorgewerkt mag worden, en dat het mandaat een bovengrens is en geen aanneemsom. Daarnaast is opgelost dat het opdrachtvenster achter het regelvenster verscheen, waardoor je de opdracht niet kon aanmaken.');
