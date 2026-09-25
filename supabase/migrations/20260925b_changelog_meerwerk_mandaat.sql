-- Changelog: verkoopbedrag/mandaat bij regie-meerwerk en stelposten.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-25','verbeterd','Meerwerk','Mandaat invullen bij regie en stelposten',
   'Bij meerwerk op regie en bij stelposten vul je nu een verkoopbedrag of mandaat in. Dat bedrag telt direct mee in het contracttotaal, ook als er nog niets geboekt is. Wordt er meer geboekt dan het mandaat, dan telt de geboekte verkoopwaarde (inclusief opslagen) en zie je bij de meerwerkregel en in de nacalculatie een oranje melding "Boven mandaat".');
