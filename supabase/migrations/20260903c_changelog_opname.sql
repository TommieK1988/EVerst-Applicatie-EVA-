-- Changelog: de opname-module is live.
--
-- Eén item voor de hele module in plaats van per commit: de opnemer merkt er niets van dat dit in
-- drie stappen op main is gekomen. Nieuwe moduletag "Opname", zoals Houtrot en Toolbox dat eerder
-- kregen.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-03', 'nieuw', 'Opname', 'Opnames doen op je telefoon',
   'Je legt op je telefoon per locatie vast wat er moet gebeuren, met foto''s erbij; valt het bereik weg, dan werk je gewoon door en wordt alles nagestuurd zodra je weer verbinding hebt. Staat het werk in de prijslijst die met de opdrachtgever is afgesproken, dan kies je het daaruit en zie je meteen wat het kost; staat het er niet in, dan voeg je een los punt toe met alleen een omschrijving. Op kantoor zet je de opname met één knop om in een calculatie, waarin de losse punten nog worden afgeprijsd. Bij dossiers met categorie Mutatie staat dit al aan; op een ander dossier zet je de schakelaar "Mutatie-opname" aan op de Informatie-tab.');
