-- Changelog: minderwerk- en kortingsregels komen weer mee in de offerte.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-07','opgelost','Offertes','Minderwerk en korting komen weer mee in de offerte',
   'Een regel met een negatief bedrag — bijvoorbeeld minderwerk of een korting — kwam bij het overnemen van de calculatie op € 0,00 in de offerte te staan. Daardoor klopte het offertetotaal niet. Zulke regels nemen nu hun eigen bedrag mee, precies zoals ze in de calculatie staan.');
