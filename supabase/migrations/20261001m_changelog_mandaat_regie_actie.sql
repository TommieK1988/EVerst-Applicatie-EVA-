-- Changelog: mandaat = regie, en de beoordeelactie sluit zichzelf.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-01','opgelost','Mailintake','Een mandaat wordt nu als regiewerk ingeschreven',
   'Staat er een mandaat of budgetplafond in de opdracht, dan is dat per definitie werk op '
   || 'nacalculatie: tot dat bedrag mogen we werken, er is geen vaste prijs afgesproken. EVA '
   || 'zette het vinkje Regie daar niet bij, waardoor zulke bonnen als aangenomen werk werden '
   || 'ingeschreven en er een aanneemsom naar Bouw7 ging die niemand had afgesproken. Dat gebeurt '
   || 'nu niet meer. De categorie blijft wel staan, dus een servicedeskbon blijft op het '
   || 'servicedeskbord.'),
  ('2026-10-01','opgelost','Mailintake','Actie "Beoordeel ..." gaat automatisch op gereed',
   'De actie die je vraagt naar een binnengekomen mail te kijken bleef openstaan nadat je de mail '
   || 'had afgehandeld. Die gaat nu zelf op gereed zodra het bericht is ingeschreven, gekoppeld, '
   || 'genegeerd of als geen aanvraag weggezet. De acties die over het dossier gaan — zoals een '
   || 'opname inplannen of termijnen instellen — blijven natuurlijk wel staan.');
