-- Changelog: servicedeskbonnen tonen weer uren per medewerker en inkoopkosten.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','opgelost','Servicedesk','Uren en inkoop zichtbaar op servicedeskbonnen',
   'Op servicedeskbonnen bleven de geboekte uren per medewerker en de inkoopkosten vaak leeg, terwijl ze in Bouw7 wel stonden. EVA haalt ze nu voor elke bon op, ook voor bonnen die al financieel gereed zijn. Op de Uren-tab van een bon staat bovendien weer een knop Vernieuwen om de nieuwste uren meteen binnen te halen.');
