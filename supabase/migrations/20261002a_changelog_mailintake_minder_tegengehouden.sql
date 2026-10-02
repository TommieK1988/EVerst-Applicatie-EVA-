-- Changelog: twee redenen waarom berichten onnodig op de stapel bleven.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-02','opgelost','Mailintake','Minder mails onnodig voorgelegd',
   'Twee dingen hielden berichten tegen die er klaar voor waren. EVA zag een nieuwe bon op een '
   || 'adres waar al eerder werk liep als "lijkt op iets dat al is ingeschreven", ook als het om '
   || 'iets heel anders ging — een vochtplek naast een lekkend dak. Hetzelfde adres werd daarbij '
   || 'vier keer meegeteld; dat is nu één keer, en een echte dubbele melding wordt nog steeds '
   || 'herkend. Daarnaast hield een foto die te groot was om te lezen een complete bon tegen. Een '
   || 'foto bevat geen gegevens die EVA nodig heeft, dus die blokkeert niet meer; een '
   || 'onleesbaar document nog wel.');
